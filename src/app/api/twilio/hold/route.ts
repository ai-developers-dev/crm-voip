import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * PUT a call on hold by redirecting it to hold music TwiML
 *
 * This uses the Twilio REST API to update the call's URL,
 * which causes Twilio to fetch new TwiML instructions (hold music).
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { twilioCallSid } = await request.json();

    if (!twilioCallSid) {
      return NextResponse.json(
        { error: "twilioCallSid is required" },
        { status: 400 }
      );
    }

    console.log(`Putting call ${twilioCallSid} on hold`);

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

    // Build hold music URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const holdMusicUrl = `${appUrl}/api/twilio/hold-music`;

    // Update the call to redirect to hold music TwiML
    await client.calls(twilioCallSid).update({
      url: holdMusicUrl,
      method: "POST",
    });

    console.log(`Call ${twilioCallSid} redirected to hold music`);

    return NextResponse.json({
      success: true,
      message: "Call placed on hold"
    });
  } catch (error) {
    console.error("Error putting call on hold:", error);
    return NextResponse.json(
      { error: "Failed to put call on hold", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
