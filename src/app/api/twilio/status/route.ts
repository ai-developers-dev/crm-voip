import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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

    // Validate webhook signature (per-subaccount auth token lookup)
    const isValid = await validateTwilioWebhook(request, params, convex);
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
