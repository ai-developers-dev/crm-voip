import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

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
    return true;
  }

  const signature = request.headers.get("X-Twilio-Signature") || "";
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
    const dialCallStatus = formData.get("DialCallStatus") as string;
    const dialCallDuration = formData.get("DialCallDuration") as string;
    const from = formData.get("From") as string;

    // Convert FormData to params object for validation
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Validate webhook signature
    const isValid = await validateTwilioRequest(request, params);
    if (!isValid) {
      console.error("Invalid Twilio webhook signature for dial-status");
      return new NextResponse("Forbidden", { status: 403 });
    }

    console.log(`Dial status: ${callSid} -> ${dialCallStatus} (duration: ${dialCallDuration}s)`);

    const twiml = new VoiceResponse();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    // Handle different dial outcomes
    switch (dialCallStatus) {
      case "completed":
        // Call was answered by an agent
        console.log("Call completed successfully - agent answered");
        // Update call status in database
        await convex.mutation(api.calls.updateStatusFromWebhook, {
          twilioCallSid: callSid,
          state: "ended",
          outcome: "answered",
          duration: parseInt(dialCallDuration) || 0,
        });
        break;

      case "no-answer":
      case "busy":
      case "failed":
        // No agent answered - go to voicemail
        console.log(`No agent answered (${dialCallStatus}) - sending to voicemail`);
        twiml.say(
          { voice: "alice" },
          "We are sorry, but all of our agents are currently unavailable. Please leave a message after the beep."
        );
        twiml.record({
          timeout: 3,
          transcribe: true,
          maxLength: 120,
          transcribeCallback: `${appUrl}/api/twilio/transcription`,
        });
        twiml.say({ voice: "alice" }, "Thank you for your message. Goodbye.");
        twiml.hangup();

        // Update call status
        await convex.mutation(api.calls.updateStatusFromWebhook, {
          twilioCallSid: callSid,
          state: "ended",
          outcome: dialCallStatus === "no-answer" ? "missed" : dialCallStatus,
        });
        break;

      case "canceled":
        // Caller hung up before agent answered
        console.log("Call canceled - caller hung up");
        await convex.mutation(api.calls.updateStatusFromWebhook, {
          twilioCallSid: callSid,
          state: "ended",
          outcome: "cancelled",
        });
        break;

      default:
        console.log(`Unknown dial status: ${dialCallStatus}`);
    }

    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[${errorId}] Dial status webhook error:`, {
      callSid,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });

    // Return empty TwiML on error
    const twiml = new VoiceResponse();
    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}
