import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { convex } from "@/lib/convex/client";
import { api } from "../../../../../convex/_generated/api";

/**
 * Test master Twilio credentials by calling the Twilio Accounts API.
 * Verifies the SID format and that the credentials can authenticate.
 * Platform super_admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Only super_admin can test master credentials
    const platformUser = await convex.query(api.platformUsers.getCurrent, {
      clerkUserId: userId,
    });
    if (!platformUser || !platformUser.isActive || platformUser.role !== "super_admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden — super_admin required" },
        { status: 403 }
      );
    }

    const { accountSid, authToken } = await request.json();

    if (!accountSid || !authToken) {
      return NextResponse.json(
        { success: false, error: "accountSid and authToken are required" },
        { status: 400 }
      );
    }

    // Format validation: Twilio Account SIDs are "AC" + 32 hex characters
    if (!/^AC[a-f0-9]{32}$/i.test(accountSid)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid Account SID format. Must start with \"AC\" followed by 32 hex characters. Find it in your Twilio Console dashboard.",
        },
        { status: 400 }
      );
    }

    // Twilio Auth Tokens are 32 hex characters
    if (!/^[a-f0-9]{32}$/i.test(authToken)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid Auth Token format. Must be 32 hex characters. Click \"Show\" next to Auth Token in your Twilio Console.",
        },
        { status: 400 }
      );
    }

    // Verify credentials by calling Twilio's Accounts API
    const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${basicAuth}`,
        },
      }
    );

    if (!twilioResponse.ok) {
      if (twilioResponse.status === 401) {
        return NextResponse.json(
          {
            success: false,
            error: "Twilio rejected the credentials (401). Double-check the Auth Token.",
          },
          { status: 400 }
        );
      }
      if (twilioResponse.status === 404) {
        return NextResponse.json(
          {
            success: false,
            error: "Account SID not found on Twilio (404).",
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: `Twilio API error (${twilioResponse.status}). Please verify your credentials.`,
        },
        { status: 400 }
      );
    }

    const accountData = await twilioResponse.json();

    return NextResponse.json({
      success: true,
      accountSid: accountData.sid,
      friendlyName: accountData.friendly_name,
      status: accountData.status,
      type: accountData.type,
    });
  } catch (err) {
    console.error("[twilio/test-master] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to test credentials" },
      { status: 500 }
    );
  }
}
