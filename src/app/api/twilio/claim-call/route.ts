import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

// Convex HTTP client for database operations
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

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

    console.log(`\n=== CLAIM CALL API DEBUG ===`);
    console.log(`Clerk userId (agentClerkId): ${userId}`);
    console.log(`Clerk orgId (clerkOrgId): ${orgId}`);
    console.log(`twilioCallSid: ${twilioCallSid}`);

    // Attempt to claim the call atomically
    // Pass clerkOrgId as fallback for race condition handling
    const result = await convex.mutation(api.calls.claimCall, {
      twilioCallSid,
      agentClerkId: userId,
      clerkOrgId: orgId || undefined,
    });

    console.log(`claimCall result:`, JSON.stringify(result, null, 2));

    if (!result.success) {
      console.log(`❌ Claim FAILED: ${result.reason}`);
      return NextResponse.json(
        { success: false, reason: result.reason },
        { status: 200 }
      );
    }

    console.log(`✅ Claim SUCCESS - callId: ${result.callId}, userId: ${result.userId}`);
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
