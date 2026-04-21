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

    // STEP 1: Check whether the call was just PARKED. If so, we must NOT
    // terminate the parent PSTN leg — the caller is now in a conference
    // with hold music waiting for an agent to unpark them. Terminating
    // the parent would kill the conference and drop the parked call.
    //
    // When an agent parks a call, hold/route.ts redirects the PSTN parent
    // into a <Conference> and inserts a parkingLots row + flips the
    // activeCall state to "parked". The browser's client leg breaks (its
    // <Dial> was superseded by the redirect) and the Voice SDK fires
    // `disconnect`, which calls this route with the CHILD SID. Prior to
    // this check, the "actively terminate the parent" logic below killed
    // the parent while it was happily sitting in the conference.
    //
    // Verified via Twilio MCP on CA9127726708724f007ab053586e57fbdc:
    // event timeline showed hold music begin playing, then a POST to
    // /Calls/{sid} terminating the parent a fraction of a second later
    // (from this route), then a "completed" status callback.
    let isParked = false;
    try {
      const activeCall = await convex.query(api.calls.getByTwilioSid, {
        twilioCallSid,
      });
      if (activeCall && activeCall.state === "parked") {
        isParked = true;
        console.log(
          `[end-call] Call ${twilioCallSid} is parked — skipping PSTN termination`
        );
      }
    } catch (queryErr) {
      // If the query fails, fall through and attempt termination anyway.
      // Better to accidentally terminate a parked call than to leave a
      // zombie PSTN leg alive.
      console.warn(
        `[end-call] Could not check parked state for ${twilioCallSid}:`,
        queryErr
      );
    }

    // STEP 2: Actively terminate the PSTN leg on Twilio (unless parked).
    //
    // Previously this route only updated Convex and relied on Twilio's
    // <Dial action> callback to eventually hang up the parent call. In
    // practice the parent leg lingered 20–30s after the agent clicked
    // hang up — verified via Twilio MCP on CA6149447ec85e69744c83b55e7e295f42
    // (parent 39s, child 3s) and CAcad0cb6ebe55e742a97fb8d260c9fb05
    // (parent 35s, child 4s).
    //
    // Fix: fetch only to learn parentCallSid, then unconditionally POST
    // Status=completed to the parent (or the browser SID itself for
    // outbound browser-to-PSTN calls where there's no parent). 20404
    // "already terminated" is expected and ignored.
    //
    // We also remember parentCallSid for STEP 3 below — for inbound calls
    // the activeCalls row is keyed by the PSTN leg's CallSid, but the
    // browser only knows the agent-leg SID. Cleaning up by the browser SID
    // leaves the row orphaned and the user-card stays stuck.
    let parentCallSid: string | null = null;
    if (orgId && !isParked) {
      try {
        const { client } = await getOrgTwilioClient(orgId);
        const browserCall = await client.calls(twilioCallSid).fetch();
        parentCallSid = browserCall.parentCallSid || null;
        const sidToEnd = parentCallSid || twilioCallSid;

        try {
          await client.calls(sidToEnd).update({ status: "completed" });
          console.log(`Terminated Twilio call ${sidToEnd}`);
        } catch (updateErr) {
          console.warn(
            `[end-call] Twilio termination of ${sidToEnd} failed (likely already ended): ${
              updateErr instanceof Error ? updateErr.message : String(updateErr)
            }`
          );
        }
      } catch (twilioErr) {
        console.warn(
          `[end-call] Could not fetch call ${twilioCallSid}: ${
            twilioErr instanceof Error ? twilioErr.message : String(twilioErr)
          }`
        );
      }
    }

    // STEP 3: Mark the call as ended in Convex.
    //
    // Inbound calls create two Twilio legs with different CallSids:
    //   - PSTN leg: caller → Twilio number (what the voice webhook sees
    //     and what `activeCalls.twilioCallSid` is keyed by)
    //   - Agent leg: Twilio → browser client (what the SDK's Call object
    //     reports via `call.parameters.CallSid`)
    // The browser sends us the *agent* SID, so we try the PSTN parent
    // first when we have one. Outbound browser-to-PSTN calls have no
    // parent, so `twilioCallSid` IS the row key — one attempt is enough.
    // Fall back to the browser SID if the parent lookup drew a blank.
    let result = await convex.mutation(api.calls.endByCallSid, {
      twilioCallSid: parentCallSid || twilioCallSid,
    });
    if (result?.alreadyCleaned && parentCallSid && parentCallSid !== twilioCallSid) {
      // Parent SID didn't match a row either — try the browser SID as a
      // last resort. Rare, but can happen if the dial-status webhook
      // already moved the row to callHistory under the browser SID.
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
