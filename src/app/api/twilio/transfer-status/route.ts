import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => { params[key] = value.toString(); });

    const isValid = await validateTwilioWebhook(request, params, convex);
    if (!isValid) return new NextResponse("Forbidden", { status: 403 });

    const transferId = request.nextUrl.searchParams.get("transferId");
    const callStatus = params["CallStatus"];

    if (!transferId) {
      return new NextResponse("OK", { status: 200 });
    }

    console.log(`Transfer status: ${transferId} -> ${callStatus}`);

    // Handle terminal states
    if (callStatus === "completed" || callStatus === "busy" || callStatus === "failed" || callStatus === "no-answer" || callStatus === "canceled") {
      if (callStatus !== "completed") {
        try {
          await convex.mutation(api.pendingTransfers.decline, {
            transferId: transferId as Id<"pendingTransfers">,
          });
        } catch {
          // Already handled (accepted, declined, or timed out)
        }
      }
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("Transfer status error:", error);
    return new NextResponse("OK", { status: 200 });
  }
}
