import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

// Initialize Convex client
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { identity } = await request.json();

    // Fetch per-tenant Twilio credentials from Convex
    // First, get the organization by Clerk org ID
    const org = await convex.query(api.organizations.getCurrent, { clerkOrgId: orgId });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Get Twilio credentials from organization settings
    const twilioCredentials = org.settings?.twilioCredentials;

    // Check if tenant has configured Twilio credentials
    if (!twilioCredentials?.isConfigured) {
      // Fall back to environment variables for backward compatibility
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const apiKey = process.env.TWILIO_API_KEY;
      const apiSecret = process.env.TWILIO_API_SECRET;
      const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

      if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
        return NextResponse.json(
          { error: "Twilio not configured. Please configure Twilio in Settings." },
          { status: 400 }
        );
      }

      // Use environment variables as fallback
      const token = new AccessToken(accountSid, apiKey, apiSecret, {
        identity: identity || `${orgId}-${userId}`,
        ttl: 14400, // 4 hours
      });

      const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: twimlAppSid,
        incomingAllow: true,
      });

      token.addGrant(voiceGrant);
      return NextResponse.json({ token: token.toJwt() });
    }

    // Use per-tenant credentials
    const { accountSid, apiKey, apiSecret, twimlAppSid } = twilioCredentials;

    // Validate required credentials
    if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
      return NextResponse.json(
        { error: "Twilio configuration incomplete. Please add API Key, API Secret, and TwiML App SID in Settings." },
        { status: 400 }
      );
    }

    // Create access token with per-tenant credentials
    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: identity || `${orgId}-${userId}`,
      ttl: 14400, // 4 hours // 1 hour
    });

    // Create Voice grant
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,
    });

    token.addGrant(voiceGrant);

    return NextResponse.json({ token: token.toJwt() });
  } catch (error) {
    console.error("Error generating Twilio token:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
