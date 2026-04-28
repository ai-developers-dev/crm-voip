import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { api } from "../../../../../convex/_generated/api";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";


export async function POST(request: NextRequest) {
  let callSid = "unknown";

  try {
    const formData = await request.formData();
    callSid = formData.get("CallSid") as string;
    const callStatus = formData.get("CallStatus") as string;
    const callDuration = formData.get("CallDuration") as string;
    const parentCallSid = (formData.get("ParentCallSid") as string) || null;
    const direction = (formData.get("Direction") as string) || null;

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

    console.log(`Status callback: ${callSid} -> ${callStatus} (parent=${parentCallSid}, dir=${direction})`);

    // P3.3 — Populate `pstnCallSid` on the activeCall row when Twilio
    // first reports the dialed-leg SID for an OUTBOUND call.
    //
    // Setup recap:
    //   - voice/route.ts inserts the activeCall keyed by the BROWSER
    //     leg's CallSid (the parent for outbound).
    //   - voice/route.ts then emits TwiML <Dial><Number statusCallback=…>
    //     which dials the PSTN destination as a CHILD call.
    //   - Twilio fires this status route with `CallSid` = child PSTN
    //     SID, `ParentCallSid` = browser leg, `Direction` like
    //     "outbound-api" or "outbound-dial".
    //
    // We set pstnCallSid on the matched-by-parent row only on
    // outbound-direction events to avoid corrupting inbound rows
    // (whose child legs are <Client> calls — those legs are NOT the
    // PSTN). Best-effort: failures are logged and ignored — the
    // row's twilioCallSid is still useful for eventual cleanup.
    if (
      parentCallSid &&
      direction &&
      direction.startsWith("outbound") &&
      callSid &&
      callSid !== parentCallSid
    ) {
      try {
        await convex.mutation(api.calls.setPstnCallSid, {
          parentCallSid,
          pstnCallSid: callSid,
        });
      } catch (err) {
        console.warn(`[status] could not set pstnCallSid for ${parentCallSid}:`, err);
      }
    }

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
