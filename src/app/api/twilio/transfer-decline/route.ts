import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Decline a transfer - called when target agent clicks Decline
 *
 * This:
 * 1. Updates the pending transfer status to "declined"
 * 2. Returns the call to parking (if from_park) or source agent (if direct)
 * 3. Redirects the call appropriately in Twilio
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { transferId, twilioCallSid } = await request.json();

    if (!transferId) {
      return NextResponse.json({ error: "transferId is required" }, { status: 400 });
    }

    console.log(`Declining transfer: ${transferId}`);

    // Decline the transfer in Convex (updates DB state and determines where to return call)
    const result = await convex.mutation(api.pendingTransfers.decline, {
      transferId: transferId as Id<"pendingTransfers">,
    });

    // The call remains on hold music - it will stay there until:
    // - Another agent picks it up from parking
    // - Or the source agent resumes it

    console.log(`Transfer ${transferId} declined, returned to: ${result.returnedTo}`);

    return NextResponse.json({
      success: true,
      returnedTo: result.returnedTo,
    });
  } catch (error) {
    console.error("Error declining transfer:", error);
    return NextResponse.json(
      { error: "Failed to decline transfer", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
