import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import twilio from "twilio";
import { api } from "../../../../../convex/_generated/api";

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
    const callStatus = formData.get("CallStatus") as string;
    const callDuration = formData.get("CallDuration") as string;

    // Convert FormData to params object for validation
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Validate webhook signature
    const isValid = await validateTwilioRequest(request, params);
    if (!isValid) {
      console.error("Invalid Twilio webhook signature for status callback");
      return new NextResponse("Forbidden", { status: 403 });
    }

    console.log(`Status callback: ${callSid} -> ${callStatus}`);

    // Map Twilio status to our call states
    const stateMap: Record<string, string> = {
      initiated: "ringing",
      ringing: "ringing",
      "in-progress": "connected",
      completed: "ended",
      busy: "ended",
      failed: "ended",
      "no-answer": "ended",
      canceled: "ended",
    };

    const outcomeMap: Record<string, string> = {
      completed: "answered",
      busy: "busy",
      failed: "failed",
      "no-answer": "missed",
      canceled: "cancelled",
    };

    const state = stateMap[callStatus] || "ended";
    const outcome = outcomeMap[callStatus];
    const duration = parseInt(callDuration) || 0;

    // Update call status in Convex
    await convex.mutation(api.calls.updateStatusFromWebhook, {
      twilioCallSid: callSid,
      state,
      outcome,
      duration,
    });

    console.log("Call status updated in Convex:", {
      twilioCallSid: callSid,
      state,
      outcome,
      duration,
    });

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[${errorId}] Status callback error:`, {
      callSid,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });

    // Return 503 to trigger Twilio retry
    return new NextResponse(
      JSON.stringify({ error: "Processing failed", errorId }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
