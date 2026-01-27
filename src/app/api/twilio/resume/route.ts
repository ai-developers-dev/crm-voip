import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Resume a call from hold by redirecting it to dial a specific agent
 *
 * This is used when unparking a call - it takes the call off hold music
 * and connects it to the target agent.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { twilioCallSid, targetIdentity, conferenceName } = await request.json();

    if (!twilioCallSid) {
      return NextResponse.json(
        { error: "twilioCallSid is required" },
        { status: 400 }
      );
    }

    if (!targetIdentity) {
      return NextResponse.json(
        { error: "targetIdentity is required" },
        { status: 400 }
      );
    }

    console.log(`📞 UNPARKING call ${twilioCallSid} to ${targetIdentity} (conference: ${conferenceName})`);

    // Get Twilio credentials
    const org = await convex.query(api.organizations.getCurrent, { clerkOrgId: orgId });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
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

    // CRITICAL: Use conference-based unpark to prevent call drops
    // The PSTN caller is already in a conference - we need to dial the target agent into that conference
    // instead of redirecting the caller away from the conference

    if (!conferenceName) {
      return NextResponse.json(
        { error: "Conference name is required for unparking" },
        { status: 400 }
      );
    }

    try {
      // Step 1: Get the conference by friendly name
      const conferences = await client.conferences.list({
        friendlyName: conferenceName,
        status: "in-progress",
        limit: 1,
      });

      if (conferences.length === 0) {
        console.error(`Conference not found: ${conferenceName}`);
        return NextResponse.json(
          { error: "Conference not found or already ended" },
          { status: 404 }
        );
      }

      const conference = conferences[0];
      console.log(`Found conference: ${conference.sid}`);

      // Step 2: Add the target agent to the conference
      // This dials the agent and connects them to the parked caller
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      const participant = await client.conferences(conference.sid)
        .participants
        .create({
          from: process.env.TWILIO_PHONE_NUMBER || "",
          to: `client:${targetIdentity}`,
          earlyMedia: true,
          statusCallback: `${appUrl}/api/twilio/status`,
          statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
          // Agent starts the conference when they answer
          startConferenceOnEnter: true,
          endConferenceOnExit: false,
        });

      console.log(`✅ Agent ${targetIdentity} added to conference ${conference.sid} - call will ring on their device`);

      // Clear the parking slot immediately (don't wait for conference callback)
      try {
        await convex.mutation(api.parkingLot.clearByConference, {
          conferenceName,
        });
        console.log(`✅ Parking slot cleared for conference: ${conferenceName}`);
      } catch (clearError) {
        // Non-fatal - the conference callback will also try to clear it
        console.warn("Could not clear parking slot immediately:", clearError);
      }

      return NextResponse.json({
        success: true,
        message: "Agent added to conference",
        conferenceSid: conference.sid,
        participantSid: participant.callSid,
      });
    } catch (twilioError) {
      console.error("Failed to add agent to conference:", twilioError);
      return NextResponse.json(
        { error: "Failed to add agent to conference", details: String(twilioError) },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error resuming call:", error);
    return NextResponse.json(
      { error: "Failed to resume call", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
