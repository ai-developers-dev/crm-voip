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

    // Build resume URL with target identity as query param
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const resumeUrl = `${appUrl}/api/twilio/resume-dial?target=${encodeURIComponent(targetIdentity)}`;

    // Update the call to redirect to dial the target agent
    await client.calls(twilioCallSid).update({
      url: resumeUrl,
      method: "POST",
    });

    console.log(`✅ Call ${twilioCallSid} resumed and routing to ${targetIdentity}`);

    // Clear the parking slot immediately (don't wait for conference callback)
    if (conferenceName) {
      try {
        await convex.mutation(api.parkingLot.clearByConference, {
          conferenceName,
        });
        console.log(`✅ Parking slot cleared for conference: ${conferenceName}`);
      } catch (clearError) {
        // Non-fatal - the conference callback will also try to clear it
        console.warn("Could not clear parking slot immediately:", clearError);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Call resumed and parking slot cleared"
    });
  } catch (error) {
    console.error("Error resuming call:", error);
    return NextResponse.json(
      { error: "Failed to resume call", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
