import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

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
        await convex.mutation(api.aiCallHistory.updateByRetellCallId, {
          retellCallId,
          updates: {
            status: "ongoing",
            startedAt: Date.now(),
          },
        });
        break;
      }

      case "call_ended": {
        // Update call history with final data
        await convex.mutation(api.aiCallHistory.updateByRetellCallId, {
          retellCallId,
          updates: {
            status: "ended",
            endedAt: Date.now(),
            durationMs: call.duration_ms ?? undefined,
            transcript: call.transcript ?? undefined,
            transcriptObject: call.transcript_object ?? undefined,
            recordingUrl: call.recording_url ?? undefined,
            disconnectionReason: call.disconnection_reason ?? undefined,
            transferDestination: call.transfer_destination ?? undefined,
          },
        });

        // Look up the call record to get contactId and orgId for workflow triggers
        const callRecord = await convex.query(api.aiCallHistory.getByRetellCallId, {
          retellCallId,
        });

        if (callRecord?.contactId && callRecord?.organizationId) {
          // Trigger workflows for ai_call_completed
          try {
            await convex.mutation(api.workflowEngine.checkTriggersPublic, {
              organizationId: callRecord.organizationId as Id<"organizations">,
              triggerType: "ai_call_completed",
              contactId: callRecord.contactId as Id<"contacts">,
              triggerData: {
                retellCallId,
                direction: callRecord.direction,
                durationMs: call.duration_ms,
                disconnectionReason: call.disconnection_reason,
              },
            });
          } catch (triggerErr) {
            // Don't fail the webhook if workflow trigger fails
            console.error("[retell-webhook] Workflow trigger error:", triggerErr);
          }
        }
        break;
      }

      case "call_analyzed": {
        await convex.mutation(api.aiCallHistory.updateByRetellCallId, {
          retellCallId,
          updates: {
            callSummary: call.call_analysis?.call_summary ?? undefined,
            userSentiment: call.call_analysis?.user_sentiment ?? undefined,
            callSuccessful: call.call_analysis?.call_successful ?? undefined,
            customAnalysis: call.call_analysis?.custom_analysis_data ?? undefined,
            callCostCents: call.cost_metadata?.total_cost_cents ?? undefined,
          },
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
