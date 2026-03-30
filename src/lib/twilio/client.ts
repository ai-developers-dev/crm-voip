import twilio, { Twilio } from "twilio";
import { convex } from "@/lib/convex/client";
import { api } from "../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Get an authenticated Twilio client for a given organization.
 *
 * Handles credential fetching from Convex, decryption of encrypted auth tokens,
 * and fallback to environment variables for backward compatibility.
 *
 * @param clerkOrgId - The Clerk organization ID (e.g., "org_xxx")
 * @returns The Twilio client, account SID, and organization document
 */
export async function getOrgTwilioClient(clerkOrgId: string) {
  const org = await convex.query(api.organizations.getCurrent, { clerkOrgId });
  if (!org) {
    throw new Error("Organization not found");
  }

  const { client, accountSid } = await getOrgTwilioClientFromOrg(org);
  return { client, accountSid, org };
}

/**
 * Get an authenticated Twilio client from an already-fetched org document.
 * Use this when you've already queried the org (to avoid a duplicate fetch).
 */
export async function getOrgTwilioClientFromOrg(org: {
  _id: Id<"organizations">;
  settings?: {
    twilioCredentials?: {
      isConfigured?: boolean;
      accountSid?: string;
      authToken?: string;
      twimlAppSid?: string;
    };
  } | null;
}): Promise<{
  client: Twilio;
  accountSid: string;
}> {
  const creds = org.settings?.twilioCredentials;
  let accountSid: string;
  let authToken: string;

  if (creds?.isConfigured && creds.accountSid && creds.authToken) {
    accountSid = creds.accountSid;
    try {
      authToken = decrypt(creds.authToken, org._id);
    } catch {
      // Token may not be encrypted (legacy) — use as-is
      authToken = creds.authToken;
    }
  } else {
    accountSid = process.env.TWILIO_ACCOUNT_SID || "";
    authToken = process.env.TWILIO_AUTH_TOKEN || "";
  }

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured");
  }

  return { client: twilio(accountSid, authToken), accountSid };
}
