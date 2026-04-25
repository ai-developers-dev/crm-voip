import { NextRequest, NextResponse } from "next/server";
import { getConvexHttpClient } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { getOrgTwilioClient } from "@/lib/twilio/client";

/**
 * Initiate a conference-based call transfer (cold or warm).
 *
 * Cold transfer (`mode: "cold"`)
 *   1. Move the PSTN caller leg into a fresh conference (waitUrl plays
 *      hold music while alone).
 *   2. The source agent's <Dial> bridge breaks the moment the caller
 *      moves — their browser SDK fires `disconnect` and their UI clears.
 *   3. Create an outbound call to the target's browser. When they
 *      answer, the transfer-ring TwiML drops them into the SAME
 *      conference. Caller and target are now connected.
 *
 * Warm transfer (`mode: "warm"`)
 *   Same as cold, BUT we also redirect the source agent's leg
 *   (`childCallSid` for inbound, the parent SID for outbound) into the
 *   conference so they remain on the call. They can introduce the
 *   target to the caller, then drop out by hanging up. Conference is
 *   created with `endConferenceOnExit=false` so the caller + target
 *   stay connected after the source leaves.
 *
 * For OUTBOUND calls we look up the PSTN child via `client.calls.list`
 * with parent_sid filter — for inbound we already have the PSTN leg as
 * `activeCalls.twilioCallSid`.
 *
 * On decline / no-answer the `transfer-result` callback redirects the
 * caller back to the source agent (cold) or just dismisses the
 * pending-transfer record (warm — they're already together).
 */

const HOLD_MUSIC_URL = "https://demo.twilio.com/docs/classic.mp3";

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId: clerkActiveOrgId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      twilioCallSid,
      activeCallId,
      targetUserId,
      targetIdentity,
      sourceIdentity, // <clerkOrgId>-<clerkUserId> for the source agent
      type, // "direct" | "from_park"
      mode: requestedMode, // "cold" | "warm" — default cold
      returnToParkSlot,
      sourceUserId,
    } = body as {
      twilioCallSid: string;
      activeCallId: string;
      targetUserId: string;
      targetIdentity: string;
      sourceIdentity?: string;
      type?: "direct" | "from_park";
      mode?: "cold" | "warm";
      returnToParkSlot?: number;
      sourceUserId?: string;
    };

    if (!twilioCallSid || !targetUserId || !targetIdentity) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: twilioCallSid, targetUserId, targetIdentity",
        },
        { status: 400 },
      );
    }

    const mode = requestedMode === "warm" ? "warm" : "cold";

    // Resolve TENANT org from the call row, not from Clerk active org.
    // Same fix pattern as /api/twilio/end-call so super admins viewing
    // a tenant don't end up looking at their own (Twilio-less) org.
    const convex = getConvexHttpClient();
    let resolved: { organizationId: string; clerkOrgId: string } | null = null;
    try {
      resolved = await convex.query(api.calls.getOrgByCallSid, {
        twilioCallSid,
      });
    } catch (lookupErr) {
      console.warn(`[transfer] getOrgByCallSid failed:`, lookupErr);
    }
    const orgId = resolved?.clerkOrgId ?? clerkActiveOrgId ?? null;
    if (!orgId) {
      return NextResponse.json(
        { error: "Could not resolve organization for this call" },
        { status: 400 },
      );
    }

    // Twilio client for the right tenant.
    let client;
    let org;
    try {
      ({ client, org } = await getOrgTwilioClient(orgId));
    } catch {
      return NextResponse.json(
        { error: "Twilio credentials not configured" },
        { status: 400 },
      );
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    // Outbound caller ID for the ring-target leg.
    const callerNumber =
      (await convex
        .query(api.phoneNumbers.getOutboundCallerId, {
          clerkOrgId: orgId,
        })
        .catch(() => null)) ||
      process.env.TWILIO_PHONE_NUMBER ||
      "";

    // Step 1: Look up the activeCall row so we know direction + the
    // child-leg SID (set by claimCall for inbound).
    const activeCall = await convex.query(api.calls.getByTwilioSid, {
      twilioCallSid,
    });
    if (!activeCall) {
      return NextResponse.json(
        { error: "Active call not found in DB" },
        { status: 404 },
      );
    }

    // Step 2: Identify the PSTN leg (the external caller / callee) and
    // the source agent's leg (the leg the source agent's browser SDK
    // is talking on).
    let pstnSid: string;
    let sourceAgentSid: string | null = null;

    if (activeCall.direction === "inbound") {
      // Inbound: voice webhook stored the PSTN leg's SID as
      // twilioCallSid; claimCall stored the agent leg as childCallSid.
      pstnSid = activeCall.twilioCallSid;
      sourceAgentSid = activeCall.childCallSid ?? null;
    } else {
      // Outbound: parent = browser leg, child = PSTN leg. Look up
      // children via Twilio's REST API. Filter for the PSTN destination
      // (real numbers start with "+", client identities don't).
      sourceAgentSid = activeCall.twilioCallSid;
      try {
        const children = await client.calls.list({
          parentCallSid: activeCall.twilioCallSid,
          limit: 5,
        });
        const pstn = children.find((c) => c.to?.startsWith("+"));
        if (!pstn) {
          return NextResponse.json(
            { error: "Could not find the PSTN child leg for this outbound call" },
            { status: 500 },
          );
        }
        pstnSid = pstn.sid;
      } catch (childErr) {
        console.error("[transfer] failed to list children for outbound:", childErr);
        return NextResponse.json(
          { error: "Could not look up outbound PSTN leg" },
          { status: 500 },
        );
      }
    }

    // Step 3: Create the pendingTransfer record FIRST so we have a
    // transferId to derive the conference name from. Also flips the
    // activeCall state to "transferring", which the end-call route /
    // endByCallSid mutation use to skip termination when the source
    // agent's SDK fires disconnect a moment from now.
    const conferenceName = `transfer-${activeCall._id}-${Date.now()}`;
    const { transferId, expiresAt } = await convex.mutation(
      api.pendingTransfers.initiate,
      {
        // Derive from the row we already fetched so the frontend
        // doesn't have to look it up.
        activeCallId: (activeCallId as Id<"activeCalls">) ?? activeCall._id,
        twilioCallSid,
        sourceUserId: sourceUserId as Id<"users"> | undefined,
        targetUserId: targetUserId as Id<"users">,
        type: type ?? "direct",
        mode,
        conferenceName,
        returnToParkSlot,
      },
    );
    console.log(
      `[transfer] ${mode.toUpperCase()} transfer ${transferId} → ${targetIdentity} (conference=${conferenceName})`,
    );

    // Step 4: Move the PSTN caller into the conference. waitUrl plays
    // hold music while they're alone (target hasn't joined yet).
    const callerConferenceTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference startConferenceOnEnter="true" endConferenceOnExit="false" waitUrl="${HOLD_MUSIC_URL}" waitMethod="GET">${conferenceName}</Conference>
  </Dial>
</Response>`;
    try {
      await client.calls(pstnSid).update({ twiml: callerConferenceTwiml });
      console.log(`[transfer] PSTN leg ${pstnSid} → conference ${conferenceName}`);
    } catch (updateErr) {
      console.error("[transfer] failed to redirect PSTN leg:", updateErr);
      // Best-effort decline so the DB doesn't dangle.
      await convex
        .mutation(api.pendingTransfers.decline, {
          transferId: transferId as Id<"pendingTransfers">,
        })
        .catch(() => {});
      return NextResponse.json(
        { error: "Failed to move caller into transfer conference" },
        { status: 500 },
      );
    }

    // Step 5: Warm only — also move the source agent's leg into the
    // conference. They keep their browser SDK call open; their audio
    // is just rerouted into the conference. Cold-mode skips this and
    // the source agent's leg ends naturally when their <Dial> breaks.
    if (mode === "warm" && sourceAgentSid) {
      const sourceConferenceTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference startConferenceOnEnter="true" endConferenceOnExit="false">${conferenceName}</Conference>
  </Dial>
</Response>`;
      try {
        await client
          .calls(sourceAgentSid)
          .update({ twiml: sourceConferenceTwiml });
        console.log(
          `[transfer] source agent leg ${sourceAgentSid} → conference ${conferenceName}`,
        );
      } catch (warmErr) {
        // Non-fatal: warm transfer degrades to cold if the source leg
        // can't be redirected. Caller is still in the conference.
        console.warn(
          "[transfer] warm-mode source redirect failed, transfer will behave as cold:",
          warmErr,
        );
      }
    }

    // Step 6: Ring the target. The transfer-ring TwiML drops the
    // target into the same conference when they answer. statusCallback
    // catches no-answer / busy / canceled and triggers cleanup.
    const transferRingUrl = `${appUrl}/api/twilio/transfer-ring?transferId=${transferId}`;
    const outboundCall = await client.calls.create({
      to: `client:${targetIdentity}`,
      from: callerNumber,
      url: transferRingUrl,
      method: "POST",
      statusCallback: `${appUrl}/api/twilio/transfer-status?transferId=${transferId}`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      timeout: 30,
    });
    console.log(`[transfer] target ring initiated: ${outboundCall.sid}`);

    void org; // currently unused; keeping for future per-org config
    void sourceIdentity; // reserved for warm-fallback decline redirect

    return NextResponse.json({
      success: true,
      transferId,
      mode,
      conferenceName,
      targetCallSid: outboundCall.sid,
      expiresAt,
    });
  } catch (error) {
    console.error("Error initiating transfer:", error);
    return NextResponse.json(
      {
        error: "Failed to initiate transfer",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
