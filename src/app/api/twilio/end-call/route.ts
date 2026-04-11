import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
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
    // (if any) can run. Safe no-op if the mutation doesn't need auth.
    const convexJwt = await getToken({ template: "convex" });
    if (convexJwt) convex.setAuth(convexJwt);

    const { twilioCallSid } = await request.json();

    if (!twilioCallSid) {
      return NextResponse.json(
        { error: "twilioCallSid is required" },
        { status: 400 }
      );
    }

    console.log(`Ending call ${twilioCallSid} via frontend cleanup`);

    // STEP 1: Actively terminate the PSTN leg on Twilio.
    //
    // Previously this route only updated Convex and relied on Twilio's
    // <Dial action> callback to eventually hang up the parent call. In
    // practice the parent leg lingered 20–30s after the agent clicked
    // hang up — verified via Twilio MCP: parent call duration 35s vs
    // child (agent) call duration 4s on CAcad0cb6ebe55e742a97fb8d260c9fb05
    // and again 39s vs 3s on CA6149447ec85e69744c83b55e7e295f42.
    //
    // My first attempt at this fix (d053f11) guarded the update behind
    // `browserCall.status !== "completed"`, but by the time end-call runs
    // the browser's call.disconnect() has already told Twilio the CHILD
    // leg is done, so the child's status is already "completed" and we
    // skipped the parent termination entirely. Root cause of the repeat
    // 28s zombie parent leg.
    //
    // Fix: fetch only to learn parentCallSid, then unconditionally POST
    // Status=completed to the parent (or the browser SID itself for
    // outbound browser-to-PSTN calls where there's no parent). Catch any
    // error — "already terminated" returns a harmless 20404 that we
    // explicitly ignore.
    if (orgId) {
      try {
        const { client } = await getOrgTwilioClient(orgId);
        const browserCall = await client.calls(twilioCallSid).fetch();
        const sidToEnd = browserCall.parentCallSid || twilioCallSid;

        try {
          await client.calls(sidToEnd).update({ status: "completed" });
          console.log(`Terminated Twilio call ${sidToEnd}`);
        } catch (updateErr) {
          // 20404 "call not found" or "call already terminated" are expected
          // when the call ended on its own microseconds before this POST.
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
