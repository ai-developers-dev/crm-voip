import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

// Convex HTTP client for database operations
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { twilioCallSid } = await request.json();

    if (!twilioCallSid) {
      return NextResponse.json(
        { error: "twilioCallSid is required" },
        { status: 400 }
      );
    }

    console.log(`Agent ${userId} attempting to claim call ${twilioCallSid}`);

    // Attempt to claim the call atomically
    const result = await convex.mutation(api.calls.claimCall, {
      twilioCallSid,
      agentClerkId: userId,
    });

    if (!result.success) {
      console.log(`Claim failed for ${twilioCallSid}: ${result.reason}`);
      return NextResponse.json(
        { success: false, reason: result.reason },
        { status: 200 }
      );
    }

    // Increment inbound call count on the user record
    // This stores the count directly on the user for real-time display
    if (result.userId) {
      try {
        await convex.mutation(api.users.incrementCallCount, {
          userId: result.userId,
          direction: "inbound",
        });
        console.log(`✅ Incremented inbound call count for user ${result.userId}`);
      } catch (error) {
        console.error("Failed to increment call count:", error);
        // Don't fail the claim if metrics fail
      }
    }

    console.log(`Agent ${userId} successfully claimed call ${twilioCallSid}`);
    return NextResponse.json({
      success: true,
      callId: result.callId,
    });
  } catch (error) {
    console.error("Error claiming call:", error);
    return NextResponse.json(
      { error: "Failed to claim call" },
      { status: 500 }
    );
  }
}
