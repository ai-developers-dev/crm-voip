import { NextRequest, NextResponse } from "next/server";
import { getConvexHttpClient } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { getOrgTwilioClient } from "@/lib/twilio/client";


export async function POST(request: NextRequest) {
  try {
    const { userId, orgId: clerkActiveOrgId, getToken } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Forward Clerk identity to Convex so endByCallSid's authorizeOrgMember
    // (if any) can run. Use a per-request client — never mutate the shared
    // singleton, or the expired JWT will poison every other server route.
    const convexJwt = await getToken({ template: "convex" });
    const convex = getConvexHttpClient(convexJwt);

    const { twilioCallSid } = await request.json();

    if (!twilioCallSid) {
      return NextResponse.json(
        { error: "twilioCallSid is required" },
        { status: 400 }
      );
    }

    console.log(`Ending call ${twilioCallSid} via frontend cleanup`);

    // Resolve the TENANT org from the call record itself rather than
    // trusting Clerk's active-org, which is wrong for super admins
    // viewing a tenant at `/admin/tenants/[id]` — their active org is
    // their own platform org, which has no Twilio creds. That mismatch
    // made `getOrgTwilioClient` throw, left `parentCallSid` null, and
    // then silently no-opped the whole cleanup — leaving the call card
    // stuck on the tenant's user row.
    let orgId: string | null = null;
    try {
      const resolved = await convex.query(api.calls.getOrgByCallSid, {
        twilioCallSid,
      });
      orgId = resolved?.clerkOrgId ?? null;
    } catch (lookupErr) {
      console.warn(
        `[end-call] getOrgByCallSid failed for ${twilioCallSid}:`,
        lookupErr
      );
    }
    // Fallback to Clerk active org only if the call record is gone
    // (already cleaned up). Safe for the normal-tenant-member path.
    if (!orgId) orgId = clerkActiveOrgId ?? null;

    // STEP 1: Look up the activeCall row once. We need its state
    // (parked / transferring) AND its `pstnCallSid` (the leg we
    // terminate on Twilio). After P3.1-3, every freshly-created
    // row has pstnCallSid populated — so we can skip the round-trip
    // to Twilio's REST API in the common path.
    let activeCall: {
      state: string;
      pstnCallSid?: string;
      twilioCallSid: string;
    } | null = null;
    try {
      activeCall = await convex.query(api.calls.getByTwilioSid, {
        twilioCallSid,
      });
    } catch (queryErr) {
      console.warn(
        `[end-call] Could not look up activeCall for ${twilioCallSid}:`,
        queryErr,
      );
    }

    let isParked = activeCall?.state === "parked";
    let isTransferring = activeCall?.state === "transferring";
    if (isParked) {
      console.log(`[end-call] ${twilioCallSid} is parked — skipping PSTN termination`);
    }
    if (isTransferring) {
      console.log(`[end-call] ${twilioCallSid} is transferring — skipping PSTN termination`);
    }

    // STEP 2: Resolve the PSTN leg SID. After P3 this is just a
    // field read on the row — no Twilio API round-trip in the
    // common path. Fall back to fetching from Twilio for legacy
    // rows that pre-date P3 (no `pstnCallSid` populated yet).
    let pstnSid: string | null = activeCall?.pstnCallSid ?? null;
    if (!pstnSid && orgId && !isParked && !isTransferring) {
      try {
        const { client } = await getOrgTwilioClient(orgId);
        const browserCall = await client.calls(twilioCallSid).fetch();
        pstnSid = browserCall.parentCallSid || twilioCallSid;
      } catch (twilioErr) {
        console.warn(
          `[end-call] Could not fetch call ${twilioCallSid} to learn parent: ${
            twilioErr instanceof Error ? twilioErr.message : String(twilioErr)
          }`,
        );
      }
    }

    // STEP 3: Belt-and-suspenders parked check via parkingLots
    // (authoritative source). If a slot exists for the PSTN SID,
    // the call is parked, period — even if state didn't get patched.
    if (!isParked && pstnSid) {
      try {
        const parkedSlot = await convex.query(
          api.parkingLot.getOccupiedByPstnSid,
          { pstnCallSid: pstnSid },
        );
        if (parkedSlot) {
          console.log(
            `[end-call] ${pstnSid} has active parking slot #${parkedSlot.slotNumber} — skipping termination`,
          );
          isParked = true;
        }
      } catch (parkLookupErr) {
        console.warn("[end-call] parking-slot lookup failed:", parkLookupErr);
      }
    }

    // STEP 4: Actively terminate the PSTN leg on Twilio (unless
    // parked / transferring). Without this, the parent leg used to
    // linger 20-30s after the agent clicked hangup. 20404 "already
    // terminated" is expected and ignored.
    if (orgId && pstnSid && !isParked && !isTransferring) {
      try {
        const { client } = await getOrgTwilioClient(orgId);
        await client.calls(pstnSid).update({ status: "completed" });
        console.log(`[end-call] Terminated Twilio call ${pstnSid}`);
      } catch (updateErr) {
        console.warn(
          `[end-call] Twilio termination of ${pstnSid} failed (likely already ended): ${
            updateErr instanceof Error ? updateErr.message : String(updateErr)
          }`,
        );
      }
    }

    // STEP 5: Mark the call as ended in Convex.
    // Prefer the row's `twilioCallSid` (= PSTN parent for inbound,
    // browser parent for outbound — always the row key) so the
    // mutation hits its primary index. Fall back to the SDK's SID
    // for legacy rows whose lookup we couldn't resolve above.
    const sidForCleanup = activeCall?.twilioCallSid ?? pstnSid ?? twilioCallSid;
    let result = await convex.mutation(api.calls.endByCallSid, {
      twilioCallSid: sidForCleanup,
    });
    if (
      result?.alreadyCleaned &&
      sidForCleanup !== twilioCallSid
    ) {
      // Last-resort retry with the browser SID. Rare — can happen
      // if dial-status already moved the row to callHistory.
      result = await convex.mutation(api.calls.endByCallSid, {
        twilioCallSid,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error ending call:", error);
    return NextResponse.json(
      { error: "Failed to end call" },
      { status: 500 }
    );
  }
}
