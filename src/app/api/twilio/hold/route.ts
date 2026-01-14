import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Park a call using conference-based parking
 *
 * This redirects the call to join a Twilio Conference with hold music.
 * The conference persists even after the agent disconnects (endConferenceOnExit=false).
 * This is the Twilio-recommended approach for call parking.
 *
 * See: https://www.twilio.com/docs/voice/twiml/conference
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { twilioCallSid, callerNumber, callerName } = await request.json();

    if (!twilioCallSid) {
      return NextResponse.json(
        { error: "twilioCallSid is required" },
        { status: 400 }
      );
    }

    console.log(`Parking call ${twilioCallSid} using conference`);

    // Get Twilio credentials (check org settings first, then env vars)
    const org = await convex.query(api.organizations.getCurrent, { clerkOrgId: orgId });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Get Twilio credentials
    const twilioCredentials = org.settings?.twilioCredentials;
    let accountSid: string;
    let authToken: string;

    if (twilioCredentials?.isConfigured && twilioCredentials.accountSid && twilioCredentials.authToken) {
      accountSid = twilioCredentials.accountSid;
      authToken = twilioCredentials.authToken;
    } else {
      // Fall back to environment variables
      accountSid = process.env.TWILIO_ACCOUNT_SID || "";
      authToken = process.env.TWILIO_AUTH_TOKEN || "";
    }

    if (!accountSid || !authToken) {
      return NextResponse.json(
        { error: "Twilio credentials not configured" },
        { status: 400 }
      );
    }

    // Create Twilio REST client
    const client = twilio(accountSid, authToken);

    // Create unique conference name for this parked call
    const conferenceName = `park-${twilioCallSid}-${Date.now()}`;

    // Conference-based parking with hold music
    // - waitUrl: Plays hold music from Twilio's free twimlet
    // - startConferenceOnEnter: Conference starts immediately
    // - endConferenceOnExit: false = call stays in conference after agent disconnects
    const twiml = `
      <Response>
        <Dial>
          <Conference
            waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical"
            startConferenceOnEnter="true"
            endConferenceOnExit="false"
          >${conferenceName}</Conference>
        </Dial>
      </Response>
    `.trim();

    // Update the call with conference TwiML
    await client.calls(twilioCallSid).update({
      twiml: twiml,
    });

    console.log(`Call ${twilioCallSid} parked in conference: ${conferenceName}`);

    return NextResponse.json({
      success: true,
      conferenceName,
      twilioCallSid,
      message: "Call parked in conference with hold music"
    });
  } catch (error) {
    console.error("Error parking call:", error);
    return NextResponse.json(
      { error: "Failed to park call", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
