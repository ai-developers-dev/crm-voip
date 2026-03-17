import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const body = await req.json();
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
