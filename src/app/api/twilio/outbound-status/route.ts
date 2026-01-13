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

    // Convert FormData to params object for validation
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Validate webhook signature
    const isValid = await validateTwilioRequest(request, params);
    if (!isValid) {
      console.error("Invalid Twilio webhook signature for outbound-status");
      return new NextResponse("Forbidden", { status: 403 });
    }

    console.log(`Outbound status: ${callSid} -> ${dialCallStatus} (duration: ${dialCallDuration}s)`);

    const twiml = new VoiceResponse();

    // Map dial status to our outcome
    let outcome: string;
    switch (dialCallStatus) {
      case "completed":
        outcome = "answered";
        break;
      case "no-answer":
        outcome = "missed";
        break;
      case "busy":
        outcome = "busy";
        break;
      case "failed":
        outcome = "failed";
        break;
      case "canceled":
        outcome = "cancelled";
        break;
      default:
        outcome = dialCallStatus || "unknown";
    }

    // Update call status in database
    await convex.mutation(api.calls.updateStatusFromWebhook, {
      twilioCallSid: callSid,
      state: "ended",
      outcome,
      duration: parseInt(dialCallDuration) || 0,
    });

    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[${errorId}] Outbound status webhook error:`, {
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
