import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";


export async function POST(request: NextRequest) {
  try {
    const { userId, orgId, getToken } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Forward the agent's Clerk identity to Convex. claimCall calls
    // authorizeOrgMember -> requireAuth, which throws "Not authenticated"
    // without a JWT on the client. When that throws, the mutation fails
    // silently (the browser logs but keeps going), so the activeCall
    // row never gets answeredAt set. That makes endByCallSid later mark
    // the call as outcome="missed" in call history even though the agent
    // actually answered and talked. Root cause of "answered calls showing
    // as missed" in the call log.
    const convexJwt = await getToken({ template: "convex" });
    if (convexJwt) convex.setAuth(convexJwt);

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
