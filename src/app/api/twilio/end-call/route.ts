import { NextRequest, NextResponse } from "next/server";
import { getConvexHttpClient } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { getOrgTwilioClient } from "@/lib/twilio/client";


export async function POST(request: NextRequest) {
  try {
    const { userId, orgId, getToken } = await auth();

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
    if (orgId && !isParked) {
      try {
        const { client } = await getOrgTwilioClient(orgId);
        const browserCall = await client.calls(twilioCallSid).fetch();
        const sidToEnd = browserCall.parentCallSid || twilioCallSid;

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

    // STEP 2: Mark the call as ended in Convex.
    const result = await convex.mutation(api.calls.endByCallSid, {
      twilioCallSid,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error ending call:", error);
    return NextResponse.json(
      { error: "Failed to end call" },
      { status: 500 }
    );
  }
}
