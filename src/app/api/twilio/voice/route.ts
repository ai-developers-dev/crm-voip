import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

// Validate Twilio webhook signature
async function validateTwilioRequest(
  request: NextRequest,
  params: Record<string, string>
): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn("TWILIO_AUTH_TOKEN not set - skipping validation");
    return true; // Allow in development without auth token
  }

  const signature = request.headers.get("X-Twilio-Signature") || "";

  // Get the full URL that Twilio used (use APP_URL for correct hostname)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.url;
  const urlPath = new URL(request.url).pathname;
  const fullUrl = appUrl.endsWith("/")
    ? `${appUrl.slice(0, -1)}${urlPath}`
    : `${appUrl}${urlPath}`;

  return twilio.validateRequest(authToken, signature, fullUrl, params);
}

export async function POST(request: NextRequest) {
  let callSid = "unknown";

  try {
    const formData = await request.formData();
    callSid = formData.get("CallSid") as string;
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const direction = formData.get("Direction") as string;

    // Convert FormData to params object for validation
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Validate webhook signature
    const isValid = await validateTwilioRequest(request, params);
    if (!isValid) {
      console.error("Invalid Twilio webhook signature for voice webhook");
      return new NextResponse("Forbidden", { status: 403 });
    }

    console.log(`Voice webhook: ${callSid} from ${from} to ${to} (${direction})`);

    const twiml = new VoiceResponse();

    // Check if this is an outbound call from browser
    if (to && !to.startsWith("client:")) {
      // Outbound call to PSTN
      const dial = twiml.dial({
        callerId: process.env.TWILIO_PHONE_NUMBER || from,
        timeout: 30,
        record: "record-from-answer-dual",
        recordingStatusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/recording`,
      });

      dial.number(to);
    } else {
      // Incoming call - put in conference for agent to join
      const conferenceName = `call-${callSid}`;

      const dial = twiml.dial({
        callerId: from,
        timeout: 30,
      });

      dial.conference(
        {
          beep: "false" as const,
          startConferenceOnEnter: false, // Wait for agent
          endConferenceOnExit: false,
          waitUrl: "http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical",
          statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/conference`,
          statusCallbackEvent: ["start", "end", "join", "leave", "mute", "hold"],
        },
        conferenceName
      );
    }

    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[${errorId}] Voice webhook error:`, {
      callSid,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });

    // Return TwiML error message (always return valid TwiML for voice)
    const twiml = new VoiceResponse();
    twiml.say("We're sorry, an error occurred. Please try your call again.");
    twiml.hangup();

    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}

// Also handle GET for testing
export async function GET() {
  const twiml = new VoiceResponse();
  twiml.say("Voice webhook is working");

  return new NextResponse(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
