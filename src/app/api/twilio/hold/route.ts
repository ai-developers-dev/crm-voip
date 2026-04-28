import { NextRequest, NextResponse } from "next/server";
import { getConvexHttpClient } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { getOrgTwilioClient } from "@/lib/twilio/client";


/**
 * Park a call using conference-based parking
 *
 * Flow (same as working app):
 * 1. Get parent call SID (PSTN caller)
 * 2. Save to database FIRST (ensures UI updates immediately)
 * 3. THEN redirect the call to conference
 *
 * This ensures the parking lot entry exists before any status callbacks arrive.
 * Updated: 2026-01-14 - Convex functions deployed
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId, getToken } = await auth();

    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Forward the caller's Clerk identity to the Convex client. parkByCallSid
    // calls authorizeOrgMember -> requireAuth, which throws "Not authenticated"
    // if the Convex client has no JWT attached. Without this, parking dies on
    // every click with a 500 from the Convex mutation.
    //
    // Use a per-request client — never mutate the shared singleton, or an
    // expired JWT leaks into unrelated routes and triggers Convex's
    // "Could not verify OIDC token claim" rejection.
    const convexJwt = await getToken({ template: "convex" });
    const convex = getConvexHttpClient(convexJwt);

    const { twilioCallSid, callerNumber, callerName, organizationId, parkedByUserId } = await request.json();

    if (!twilioCallSid) {
      return NextResponse.json(
        { error: "twilioCallSid is required" },
        { status: 400 }
      );
    }

    // Park the call via conference-based parking.

    // Resolve the TENANT org from the call row, not from Clerk active
    // org. Same fix pattern as /api/twilio/end-call so super admins
    // viewing /admin/tenants/[id] don't blow up on `getOrgTwilioClient`
    // because their own Clerk org has no Twilio creds.
    let resolvedOrgId = orgId;
    try {
      const resolvedOrg = await convex.query(api.calls.getOrgByCallSid, {
        twilioCallSid,
      });
      if (resolvedOrg?.clerkOrgId) {
        resolvedOrgId = resolvedOrg.clerkOrgId;
      }
    } catch (lookupErr) {
      console.warn(`[hold] getOrgByCallSid failed:`, lookupErr);
    }

    // Get Twilio credentials.
    let twilioResult;
    try {
      twilioResult = await getOrgTwilioClient(resolvedOrgId);
    } catch {
      return NextResponse.json(
        { error: "Twilio credentials not configured" },
        { status: 400 }
      );
    }
    const { client, org } = twilioResult;

    // STEP 1: Resolve the PSTN leg SID. After P3, every fresh
    // activeCalls row has `pstnCallSid` populated for both
    // directions, so this is a single Convex read in the common
    // path. Legacy rows (created before P3 deployed) fall back to
    // the original Twilio-API parent/child traversal.
    let pstnCallSid = "";
    try {
      const activeCallRow = await convex.query(api.calls.getByTwilioSid, {
        twilioCallSid,
      });
      if (activeCallRow?.pstnCallSid) {
        pstnCallSid = activeCallRow.pstnCallSid;
      }
    } catch (lookupErr) {
      console.warn("[hold] activeCall lookup failed:", lookupErr);
    }

    if (!pstnCallSid) {
      // Fallback for legacy rows: traverse Twilio's parent/child
      // graph to find the PSTN leg ourselves. Slow (extra REST
      // round-trips) but covers any row that pre-dates P3.
      let browserCall;
      try {
        browserCall = await client.calls(twilioCallSid).fetch();
      } catch (twilioError) {
        console.error("Could not fetch browser call:", twilioError);
        return NextResponse.json(
          { error: "Failed to fetch browser call from Twilio", details: String(twilioError) },
          { status: 500 }
        );
      }

      if (browserCall.parentCallSid) {
        pstnCallSid = browserCall.parentCallSid;
      } else {
        const children = await client.calls.list({
          parentCallSid: twilioCallSid,
          limit: 5,
        }).catch(() => [] as Array<{ sid: string; direction: string }>);
        const pstnChild = children.find((c) => c.direction.startsWith("outbound"));
        if (pstnChild?.sid) {
          pstnCallSid = pstnChild.sid;
        }
      }
    }

    if (!pstnCallSid) {
      return NextResponse.json(
        { error: "Could not locate the PSTN leg for this call" },
        { status: 400 }
      );
    }

    // Verify parent call is still active before redirecting.
    let parentCall;
    try {
      parentCall = await client.calls(pstnCallSid).fetch();
    } catch (twilioError) {
      console.error("Could not fetch parent call:", twilioError);
      return NextResponse.json(
        { error: "Failed to fetch parent call from Twilio", details: String(twilioError) },
        { status: 500 }
      );
    }

    if (parentCall.status === "completed" || parentCall.status === "canceled") {
      return NextResponse.json(
        { error: `Parent call is already ${parentCall.status}` },
        { status: 400 }
      );
    }

    // Create unique conference name
    const conferenceName = `park-${pstnCallSid}-${Date.now()}`;

    // STEP 2: Save to database FIRST (like working app)
    let parkResult;
    try {
      const convexOrgId = organizationId || org._id;

      parkResult = await convex.mutation(api.calls.parkByCallSid, {
        twilioCallSid: twilioCallSid,
        pstnCallSid: pstnCallSid, // Store the PSTN call SID for unparking
        conferenceName,
        callerNumber: callerNumber || parentCall.from || "Unknown",
        callerName: callerName,
        organizationId: convexOrgId as Id<"organizations">,
        parkedByUserId: parkedByUserId as Id<"users"> | undefined,
      });

    } catch (convexError) {
      console.error("Failed to save parking record:", convexError);
      return NextResponse.json(
        { error: "Failed to save to database", details: String(convexError) },
        { status: 500 }
      );
    }

    // STEP 3: NOW redirect the PSTN call to conference
    try {

      // Get the base URL for callbacks - must be publicly accessible (not localhost)
      // Priority: NEXT_PUBLIC_APP_URL (if production), then derive from request headers
      let baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

      // If NEXT_PUBLIC_APP_URL is localhost, try to use request headers instead
      if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
        const host = request.headers.get("host");
        const proto = request.headers.get("x-forwarded-proto") || "https";
        if (host && !host.includes("localhost")) {
          baseUrl = `${proto}://${host}`;
        }
      }

      // Fallback: derive from request URL if still localhost
      if (baseUrl.includes("localhost") || !baseUrl) {
        const requestUrl = new URL(request.url);
        if (!requestUrl.host.includes("localhost")) {
          baseUrl = requestUrl.origin;
        }
      }

      const statusCallbackUrl = `${baseUrl}/api/twilio/parking-status?conference=${encodeURIComponent(conferenceName)}`;

      // Get hold music URL - fetch fresh URL if we have a storage ID
      let holdMusicWaitUrl: string;

      // Try to get custom hold music from Convex
      let customAudioUrl: string | null = null;

      if (org.settings?.holdMusicStorageId) {
        try {
          customAudioUrl = await convex.query(api.holdMusic.getHoldMusicByClerkId, { clerkOrgId: orgId });
        } catch (err) {
          console.error("Error fetching custom hold music:", err);
        }
      }

      // Switched away from twimlets.com (third-party / undocumented
      // SLA) to Twilio-hosted demo asset, matching what /transfer
      // and /hold-music already use after H4+M5 / H1.
      const FALLBACK_HOLD_MUSIC = "https://demo.twilio.com/docs/classic.mp3";
      if (customAudioUrl) {
        // Play the uploaded file ONCE as an intro, then loop Twilio's
        // classical hold music. Previously <Play loop="0">customUrl which
        // loops the uploaded clip forever (bad when the file is a greeting).
        const twimlContent = `<Response><Play loop="1">${customAudioUrl}</Play><Play loop="0">${FALLBACK_HOLD_MUSIC}</Play></Response>`;
        holdMusicWaitUrl = `https://twimlets.com/echo?Twiml=${encodeURIComponent(twimlContent)}`;
      } else {
        holdMusicWaitUrl = FALLBACK_HOLD_MUSIC;
      }

      // IMPORTANT: startConferenceOnEnter="false" means the caller hears waitUrl music
      // while waiting alone. The conference "starts" when an agent joins with
      // startConferenceOnEnter="true" (during unpark). Until then, hold music plays.
      const twiml = `
        <Response>
          <Dial>
            <Conference
              waitUrl="${holdMusicWaitUrl}"
              waitMethod="GET"
              startConferenceOnEnter="false"
              endConferenceOnExit="false"
              statusCallback="${statusCallbackUrl}"
              statusCallbackEvent="end leave"
            >${conferenceName}</Conference>
          </Dial>
        </Response>
      `.trim();

      await client.calls(pstnCallSid).update({
        twiml: twiml,
      });
    } catch (twilioError) {
      console.error("Could not redirect call to conference:", twilioError);
      // Rollback: DB entry was created but Twilio redirect failed — undo the parking
      try {
        await convex.mutation(api.parkingLot.clearByConference, { conferenceName });
      } catch (rollbackErr) {
        console.error("Rollback failed:", rollbackErr);
      }
      return NextResponse.json(
        { error: "Failed to redirect call to conference", details: String(twilioError) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      conferenceName,
      pstnCallSid,
      browserCallSid: twilioCallSid,
      slotNumber: parkResult.slotNumber,
      message: "Call parked in conference with hold music"
    });
  } catch (error) {
    console.error("Error parking call:", error);
    return NextResponse.json(
      { error: "Failed to park call", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
