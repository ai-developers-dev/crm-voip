import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { getOrgTwilioClient } from "@/lib/twilio/client";


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
    let client;
    let org;
    try {
      ({ client, org } = await getOrgTwilioClient(orgId));
    } catch {
      return NextResponse.json(
        { error: "Twilio credentials not configured" },
        { status: 400 }
      );
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    // Get the org's phone number for the transfer caller ID
    const phoneNumbers = await convex.query(api.phoneNumbers.getByOrganization, {
      organizationId: org._id,
    });
    const callerNumber = phoneNumbers?.[0]?.phoneNumber || process.env.TWILIO_PHONE_NUMBER || "";

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
      from: callerNumber,
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
