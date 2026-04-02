import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";


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

    // Attempt to claim the call atomically
    // Pass clerkOrgId as fallback for race condition handling
    const result = await convex.mutation(api.calls.claimCall, {
      twilioCallSid,
      agentClerkId: userId,
      clerkOrgId: orgId || undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, reason: result.reason },
        { status: 200 }
      );
    }
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
