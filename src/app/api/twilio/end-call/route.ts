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
    // child (agent) call duration 4s on CAcad0cb6ebe55e742a97fb8d260c9fb05.
    //
    // Call the Twilio REST API directly to end the parent. We look up the
    // browser SDK call SID (the one the agent's Device knows) and either:
    //   (a) use its parentCallSid when the browser leg is a child of an
    //       inbound PSTN dial, OR
    //   (b) use the SID itself when the browser leg IS the primary call
    //       (outbound browser-to-PSTN).
    // Then POST ?Status=completed to that call, which cascades and ends
    // both legs immediately.
    if (orgId) {
      try {
        const { client } = await getOrgTwilioClient(orgId);
        const browserCall = await client.calls(twilioCallSid).fetch();
        const sidToEnd = browserCall.parentCallSid || twilioCallSid;

        // Only call update if the call isn't already terminated, to avoid a
        // 400 from Twilio for "Cannot complete already-completed call".
        if (
          browserCall.status !== "completed" &&
          browserCall.status !== "canceled"
        ) {
          await client.calls(sidToEnd).update({ status: "completed" });
          console.log(`Terminated Twilio call ${sidToEnd}`);
        }
      } catch (twilioErr) {
        // Log and continue — the Convex update below still needs to run.
        // Missing-call errors (20404) are expected when the call has already
        // ended on its own.
        console.warn(
          `[end-call] Twilio termination failed (may be already ended): ${
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
