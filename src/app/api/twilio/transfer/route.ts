import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Initiate a call transfer with ringing
 *
 * This endpoint:
 * 1. Puts the original call on hold (hold music)
 * 2. Creates a pending transfer record
 * 3. Rings the target agent's Twilio Client
 *
 * The target agent will see an incoming transfer popup and can accept/decline.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      twilioCallSid,
      activeCallId,
      targetUserId,
      targetIdentity,
      type,
      returnToParkSlot,
      sourceUserId,
    } = await request.json();

    if (!twilioCallSid || !activeCallId || !targetUserId || !targetIdentity) {
      return NextResponse.json(
        { error: "Missing required fields: twilioCallSid, activeCallId, targetUserId, targetIdentity" },
        { status: 400 }
      );
    }

    console.log(`Initiating transfer: ${twilioCallSid} -> ${targetIdentity}`);

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

    const client = twilio(accountSid, authToken);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    // Step 1: Put original call on hold (caller hears hold music)
    const holdMusicUrl = `${appUrl}/api/twilio/hold-music`;
    await client.calls(twilioCallSid).update({
      url: holdMusicUrl,
      method: "POST",
    });

    console.log(`Call ${twilioCallSid} put on hold`);

    // Step 2: Create pending transfer record in Convex
    const { transferId, expiresAt } = await convex.mutation(api.pendingTransfers.initiate, {
      activeCallId: activeCallId as Id<"activeCalls">,
      twilioCallSid,
      sourceUserId: sourceUserId as Id<"users"> | undefined,
      targetUserId: targetUserId as Id<"users">,
      type: type || "direct",
      returnToParkSlot,
    });

    console.log(`Created pending transfer: ${transferId}`);

    // Step 3: Create outbound call to target agent's Twilio Client
    // This will ring their browser/device
    const transferRingUrl = `${appUrl}/api/twilio/transfer-ring?transferId=${transferId}`;

    const outboundCall = await client.calls.create({
      to: `client:${targetIdentity}`,
      from: process.env.TWILIO_PHONE_NUMBER || "transfer",
      url: transferRingUrl,
      method: "POST",
      statusCallback: `${appUrl}/api/twilio/transfer-status?transferId=${transferId}`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      timeout: 30, // 30 seconds to answer
    });

    console.log(`Transfer call initiated: ${outboundCall.sid} to ${targetIdentity}`);

    return NextResponse.json({
      success: true,
      transferId,
      targetCallSid: outboundCall.sid,
      expiresAt,
    });
  } catch (error) {
    console.error("Error initiating transfer:", error);
    return NextResponse.json(
      { error: "Failed to initiate transfer", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
