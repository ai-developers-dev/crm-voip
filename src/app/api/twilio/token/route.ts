import { NextRequest, NextResponse } from "next/server";
import { getConvexHttpClient } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import twilio from "twilio";
import { api } from "../../../../../convex/_generated/api";
import { decryptLegacy } from "@/lib/credentials/crypto";

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { identity } = await request.json();

    // Per-request unauthenticated client. getCurrent is a public query so no
    // Clerk JWT is needed; using a fresh instance also guarantees we can
    // never inherit a stale JWT from any other route that mistakenly
    // mutates a shared ConvexHttpClient in the future.
    const convex = getConvexHttpClient();
    console.log("[token] v2 fresh-client route handling request");
    const org = await convex.query(api.organizations.getCurrent, { clerkOrgId: orgId });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Get Twilio credentials from organization settings
    const twilioCredentials = org.settings?.twilioCredentials;

    // Try per-tenant credentials first. If they fail to decrypt (e.g. the
    // CREDENTIAL_ENCRYPTION_KEY differs between environments), fall through
    // to env-var fallback instead of returning 500.
    let accountSid: string | undefined;
    let apiKey: string | undefined;
    let apiSecret: string | undefined;
    let twimlAppSid: string | undefined;
    let usedSource: "tenant" | "env" = "env";

    if (
      twilioCredentials?.isConfigured &&
      twilioCredentials.accountSid &&
      twilioCredentials.apiKey &&
      twilioCredentials.apiSecret &&
      twilioCredentials.twimlAppSid
    ) {
      try {
        apiSecret = decryptLegacy(twilioCredentials.apiSecret, org._id);
        accountSid = twilioCredentials.accountSid;
        apiKey = twilioCredentials.apiKey;
        twimlAppSid = twilioCredentials.twimlAppSid;
        usedSource = "tenant";
      } catch (err) {
        console.warn(
          "[token] Per-tenant Twilio decrypt failed, falling back to env vars:",
          (err as Error).message
        );
      }
    }

    if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
      accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
      apiKey = process.env.TWILIO_API_KEY?.trim();
      apiSecret = process.env.TWILIO_API_SECRET?.trim();
      twimlAppSid = process.env.TWILIO_TWIML_APP_SID?.trim();
      usedSource = "env";
    }

    if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
      return NextResponse.json(
        { error: "Twilio not configured. Please configure Twilio in Settings." },
        { status: 400 }
      );
    }

    console.log(`[token] Using ${usedSource} credentials (apiKey ${apiKey.slice(0, 6)}..., secret len ${apiSecret.length})`);

    // Create access token
    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: identity || `${orgId}-${userId}`,
      ttl: 3600, // 1 hour
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
