import twilio, { Twilio } from "twilio";
import { convex } from "@/lib/convex/client";
import { api } from "../../../convex/_generated/api";
import { decrypt, isEncrypted } from "@/lib/credentials/crypto";
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

  accountSid = "";
  authToken = "";

  if (creds?.isConfigured && creds.accountSid && creds.authToken) {
    const stored = creds.authToken;
    if (isEncrypted(stored)) {
      try {
        authToken = decrypt(stored, org._id);
        accountSid = creds.accountSid;
      } catch (err) {
        // Stored value is in iv:ct:tag format but master key can't decrypt it.
        // Returning the ciphertext would produce a Twilio 401 on every call,
        // so fall through to env credentials instead.
        console.error(
          `[twilio-client] authToken decrypt failed for org ${org._id}; falling back to env:`,
          (err as Error).message
        );
      }
    } else {
      // Legacy plaintext token
      authToken = stored;
      accountSid = creds.accountSid;
    }
  }

  if (!accountSid || !authToken) {
    accountSid = process.env.TWILIO_ACCOUNT_SID || "";
    authToken = process.env.TWILIO_AUTH_TOKEN || "";
  }

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured");
  }

  return { client: twilio(accountSid, authToken), accountSid };
}
