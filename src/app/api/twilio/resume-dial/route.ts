import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * TwiML endpoint that dials a specific agent to resume a parked call
 *
 * This is called after a call is taken off hold to connect it to an agent.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetIdentity = searchParams.get("target");

    if (!targetIdentity) {
      console.error("No target identity provided for resume-dial");
      const twiml = new VoiceResponse();
      twiml.say("Sorry, there was an error connecting your call.");
      twiml.hangup();
      return new NextResponse(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    console.log(`Resume-dial: Connecting call to ${targetIdentity}`);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const twiml = new VoiceResponse();

    // Dial the target agent's Twilio Client
    const dial = twiml.dial({
      timeout: 30,
      action: `${appUrl}/api/twilio/dial-status`,
    });

    dial.client(targetIdentity);

    const twimlString = twiml.toString();
    console.log("Resume-dial TwiML:", twimlString);

    return new NextResponse(twimlString, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Error in resume-dial:", error);

    const twiml = new VoiceResponse();
    twiml.say("Sorry, there was an error connecting your call.");
    twiml.hangup();

    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
