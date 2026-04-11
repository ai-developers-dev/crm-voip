import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { getOrgTwilioClient } from "@/lib/twilio/client";


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

      // Step 2: Add the target agent to the conference
      // This dials the agent and connects them to the parked caller
      //
      // CRITICAL: endConferenceOnExit MUST be true for the unpark leg.
      //
      // When the call was originally parked, the PSTN caller was added to
      // the conference with endConferenceOnExit=false so the conference
      // (and the caller's connection) persisted while only the caller was
      // in it waiting for someone to pick up. That's correct for parking.
      //
      // But at unpark time, the agent joins to handle the call. When the
      // agent later clicks Hang Up in the browser, the agent's participant
      // leaves the conference. If endConferenceOnExit is false on the
      // agent leg, the conference stays alive with the caller trapped in
      // it — the caller's cell phone does NOT hang up and they keep
      // hearing hold music (or silence) until they hang up themselves.
      //
      // Verified on CAc25439b623932faf8c0baa1e21802ed6 via Twilio MCP: the
      // unpark leg CA0ccf8f2b99dd551be7156be316bf4350 had parent_call_sid
      // null (outbound-api direction) so my a9c31e8 end-call REST fix
      // couldn't find the PSTN parent to terminate. Only the conference
      // itself could kill the caller.
      //
      // Setting endConferenceOnExit=true here makes Twilio automatically
      // end the conference (and all participants, including the PSTN
      // caller) when the agent leaves. Normal hang-up behavior restored
      // for unparked calls.
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
          endConferenceOnExit: true,
        });

      // Clear the parking slot immediately (don't wait for conference callback)
      try {
        await convex.mutation(api.parkingLot.clearByConference, {
          conferenceName,
        });
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
