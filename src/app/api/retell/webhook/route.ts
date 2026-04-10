import { NextResponse } from "next/server";
import crypto from "crypto";
import { convex } from "@/lib/convex/client";
import { api } from "../../../../../convex/_generated/api";


export async function POST(req: Request) {
  try {
    // Read raw body for signature validation
    const rawBody = await req.text();

    // Signature validation: Retell signs with HMAC-SHA256 using a webhook secret.
    // If RETELL_WEBHOOK_SECRET is set, enforce signature check; otherwise reject in production.
    const webhookSecret = process.env.RETELL_WEBHOOK_SECRET;
    const signature = req.headers.get("x-retell-signature") || "";

    if (webhookSecret) {
      const expected = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      // Constant-time comparison to avoid timing attacks
      const provided = signature.replace(/^sha256=/, "");
      if (
        provided.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"))
      ) {
        console.error("[retell-webhook] Invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === "production") {
      console.error("[retell-webhook] RETELL_WEBHOOK_SECRET not set in production — rejecting");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }

    const body = JSON.parse(rawBody);
    const { event, call } = body;

    if (!event || !call) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    const retellCallId = call.call_id;
    if (!retellCallId) {
      return NextResponse.json({ error: "Missing call_id" }, { status: 400 });
    }

    console.log(`[retell-webhook] Event: ${event}, Call ID: ${retellCallId}`);

    switch (event) {
      case "call_started": {
        await convex.mutation(api.aiCallHistory.update, {
          retellCallId,
          status: "ongoing",
          startedAt: Date.now(),
        });
        break;
      }

      case "call_ended": {
        await convex.mutation(api.aiCallHistory.update, {
          retellCallId,
          status: "ended",
          endedAt: Date.now(),
          durationMs: call.duration_ms ?? undefined,
          transcript: call.transcript ?? undefined,
          transcriptObject: call.transcript_object ?? undefined,
          recordingUrl: call.recording_url ?? undefined,
          disconnectionReason: call.disconnection_reason ?? undefined,
          transferDestination: call.transfer_destination ?? undefined,
        });
        break;
      }

      case "call_analyzed": {
        await convex.mutation(api.aiCallHistory.update, {
          retellCallId,
          callSummary: call.call_analysis?.call_summary ?? undefined,
          userSentiment: call.call_analysis?.user_sentiment ?? undefined,
          callSuccessful: call.call_analysis?.call_successful ?? undefined,
          customAnalysis: call.call_analysis?.custom_analysis_data ?? undefined,
          callCostCents: call.cost_metadata?.total_cost_cents ?? undefined,
        });
        break;
      }

      default:
        console.log(`[retell-webhook] Unhandled event: ${event}`);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[retell-webhook] Error:", err);
    // Always return 200 to prevent Retell from retrying
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
