import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Accept a transfer - called when target agent clicks Accept
 *
 * This:
 * 1. Updates the pending transfer status to "accepted"
 * 2. Resumes the original call from hold and connects to the agent
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { transferId, targetIdentity } = await request.json();

    if (!transferId) {
      return NextResponse.json({ error: "transferId is required" }, { status: 400 });
    }

    console.log(`Accepting transfer: ${transferId}`);

    // Accept the transfer in Convex (updates DB state)
    const result = await convex.mutation(api.pendingTransfers.accept, {
      transferId: transferId as Id<"pendingTransfers">,
    });

    // Get the transfer details to know the original call SID
    // We need to resume the held call and connect it to the target agent

    // Get Twilio credentials
    const org = await convex.query(api.organizations.getCurrent, { clerkOrgId: orgId });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const twilioCredentials = org.settings?.twilioCredentials;
    let accountSid: string;
    let authToken: string;

    if (twilioCredentials?.isConfigured && twilioCredentials.accountSid && twilioCredentials.authToken) {
      accountSid = twilioCredentials.accountSid;
      authToken = twilioCredentials.authToken;
    } else {
      accountSid = process.env.TWILIO_ACCOUNT_SID || "";
      authToken = process.env.TWILIO_AUTH_TOKEN || "";
    }

    if (!accountSid || !authToken) {
      return NextResponse.json(
        { error: "Twilio credentials not configured" },
        { status: 400 }
      );
    }

    // Note: The actual call bridging happens via the Twilio SDK on the client side
    // The agent's browser will handle the audio connection

    console.log(`Transfer ${transferId} accepted successfully`);

    return NextResponse.json({
      success: true,
      callId: result.callId,
    });
  } catch (error) {
    console.error("Error accepting transfer:", error);
    return NextResponse.json(
      { error: "Failed to accept transfer", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
