import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const VoiceResponse = twilio.twiml.VoiceResponse;

// Convex HTTP client for database operations
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    // Check if this is an outbound call from browser
    if (to && !to.startsWith("client:")) {
      // Outbound call to PSTN
      const dial = twiml.dial({
        callerId: process.env.TWILIO_PHONE_NUMBER || from,
        timeout: 30,
        action: `${appUrl}/api/twilio/dial-status`,
        record: "record-from-answer-dual",
        recordingStatusCallback: `${appUrl}/api/twilio/recording`,
      });

      dial.number(
        {
          statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
          statusCallback: `${appUrl}/api/twilio/status`,
        },
        to
      );
    } else {
      // Incoming call - look up organization by phone number
      console.log(`Looking up phone number: ${to}`);
      const phoneNumber = await convex.query(api.phoneNumbers.lookupByNumber, {
        phoneNumber: to,
      });

      if (!phoneNumber) {
        console.error(`Phone number not configured: ${to}`);
        twiml.say(
          { voice: "alice" },
          "Sorry, this number is not configured. Please try again later."
        );
        twiml.hangup();
        return new NextResponse(twiml.toString(), {
          headers: { "Content-Type": "text/xml" },
        });
      }

      console.log(`Found organization: ${phoneNumber.organizationId}`);

      // Get available agents in this organization
      const agents = await convex.query(api.users.getAvailableAgents, {
        organizationId: phoneNumber.organizationId as Id<"organizations">,
      });

      console.log(`Found ${agents.length} available agents`);

      if (agents.length === 0) {
        // No agents available - go to voicemail
        console.log("No agents available - sending to voicemail");
        twiml.say(
          { voice: "alice" },
          "We are sorry, but all of our agents are currently busy. Please leave a message after the beep."
        );
        twiml.record({
          timeout: 3,
          transcribe: true,
          maxLength: 120,
          transcribeCallback: `${appUrl}/api/twilio/transcription`,
        });
        twiml.say({ voice: "alice" }, "Thank you for your message. Goodbye.");
        twiml.hangup();

        return new NextResponse(twiml.toString(), {
          headers: { "Content-Type": "text/xml" },
        });
      }

      // Create call record in Convex
      console.log("Creating call record in Convex...");
      await convex.mutation(api.calls.createOrGetIncoming, {
        organizationId: phoneNumber.organizationId as Id<"organizations">,
        twilioCallSid: callSid,
        from,
        to,
      });

      // Dial ALL available agents simultaneously
      // First to answer wins, others stop ringing
      const dial = twiml.dial({
        timeout: 30,
        callerId: from,
        action: `${appUrl}/api/twilio/dial-status`,
      });

      // Add each agent as a Client element - Twilio rings all simultaneously
      for (const agent of agents) {
        console.log(`Adding agent to dial: ${agent.name} (${agent.clerkUserId})`);
        dial.client(agent.clerkUserId);
      }
    }

    const twimlString = twiml.toString();
    console.log("Returning TwiML:", twimlString.substring(0, 200) + "...");

    return new NextResponse(twimlString, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[${errorId}] Voice webhook error:`, {
      callSid,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
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
