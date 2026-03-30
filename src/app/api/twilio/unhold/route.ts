import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOrgTwilioClient } from "@/lib/twilio/client";


/**
 * Resume a call from hold (conference-based hold)
 *
 * This endpoint is used for multi-call scenarios where an agent
 * needs to switch between multiple calls. When switching to a held call,
 * this endpoint redirects the caller back to the agent's client.
 *
 * Flow:
 * 1. Find the conference where the call is on hold
 * 2. Get the participant (the held caller)
 * 3. Redirect them back to dial the agent's browser client
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { twilioCallSid, conferenceName } = await request.json();

    if (!twilioCallSid) {
      return NextResponse.json(
        { error: "twilioCallSid is required" },
        { status: 400 }
      );
    }

    console.log(`📞 UNHOLD CALL - Starting unhold flow for ${twilioCallSid}`);

    // Get Twilio credentials
    let client;
    let org;
    try {
      ({ client, org } = await getOrgTwilioClient(orgId));
    } catch {
      return NextResponse.json(
        { error: "Twilio credentials not configured" },
        { status: 400 }
      );
    }

    // Get the target agent's Twilio identity
    const targetIdentity = `${orgId}-${userId}`;

    // STEP 1: Fetch the call to get its current status
    let call;
    try {
      call = await client.calls(twilioCallSid).fetch();
      console.log(`Call ${twilioCallSid} status: ${call.status}`);
    } catch (twilioError) {
      console.error("Failed to fetch call:", twilioError);
      return NextResponse.json(
        { error: "Failed to fetch call from Twilio", details: String(twilioError) },
        { status: 500 }
      );
    }

    if (call.status === "completed" || call.status === "canceled") {
      return NextResponse.json(
        { error: `Call is already ${call.status}` },
        { status: 400 }
      );
    }

    // STEP 2: If we have a conference name, find the conference and redirect participants
    if (conferenceName) {
      try {
        // Find the conference
        const conferences = await client.conferences.list({
          friendlyName: conferenceName,
          status: "in-progress",
          limit: 1,
        });

        if (conferences.length > 0) {
          const conference = conferences[0];
          console.log(`Found conference ${conferenceName} (SID: ${conference.sid})`);

          // Get participants
          const participants = await client
            .conferences(conference.sid)
            .participants
            .list();

          console.log(`Conference has ${participants.length} participants`);

          // Redirect each participant (should be 1 - the held caller) to dial the agent
          // Use the call SID directly to update the call with TwiML
          for (const participant of participants) {
            console.log(`Redirecting participant ${participant.callSid} to agent ${targetIdentity}`);

            // Build TwiML to dial the agent's browser client
            const twiml = `
              <Response>
                <Dial callerId="${call.from}">
                  <Client>${targetIdentity}</Client>
                </Dial>
              </Response>
            `.trim();

            // Update the call directly (not through conference participant API)
            await client.calls(participant.callSid).update({ twiml });
          }

          return NextResponse.json({
            success: true,
            message: "Call resumed from hold conference",
            conferenceSid: conference.sid,
          });
        }
      } catch (conferenceError) {
        console.error("Error handling conference:", conferenceError);
        // Fall through to try direct call update
      }
    }

    // STEP 3: If no conference or conference handling failed, try direct call update
    // This redirects the call directly to dial the agent
    try {
      const twiml = `
        <Response>
          <Dial callerId="${call.from}">
            <Client>${targetIdentity}</Client>
          </Dial>
        </Response>
      `.trim();

      await client.calls(twilioCallSid).update({ twiml });

      console.log(`✅ Call ${twilioCallSid} redirected to agent ${targetIdentity}`);

      return NextResponse.json({
        success: true,
        message: "Call redirected to agent",
        targetIdentity,
      });
    } catch (updateError) {
      console.error("Failed to update call:", updateError);
      return NextResponse.json(
        { error: "Failed to redirect call", details: String(updateError) },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("❌ Error unholding call:", error);
    return NextResponse.json(
      { error: "Failed to unhold call", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
