/**
 * Per-subaccount Twilio webhook signature validation.
 *
 * Each tenant may have its own Twilio subaccount with a unique auth token.
 * The `AccountSid` in the webhook payload identifies which subaccount sent the request.
 * We look up the org by that AccountSid, decrypt its auth token, and validate.
 * Falls back to the global TWILIO_AUTH_TOKEN for backward compatibility.
 */

import { NextRequest } from "next/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";

/**
 * Get the correct auth token for a given Twilio AccountSid.
 *
 * 1. Look up org by AccountSid in Convex
 * 2. If found with encrypted credentials, decrypt and return
 * 3. Otherwise fall back to global env var
 */
async function getAuthTokenForAccount(
  convex: ConvexHttpClient,
  accountSid: string | null
): Promise<string> {
  if (accountSid) {
    try {
      const org = await convex.query(api.organizations.getByTwilioAccountSid, {
        accountSid,
      });
      if (org?.settings?.twilioCredentials?.authToken) {
        try {
          return decrypt(org.settings.twilioCredentials.authToken, org._id);
        } catch {
          // Decryption failed - the token may not be encrypted (legacy)
          // Try using it as-is
          return org.settings.twilioCredentials.authToken;
        }
      }
    } catch (lookupErr) {
      // Lookup failed - fall through to global token
      console.warn("Failed to look up org by AccountSid:", lookupErr);
    }
  }

  // Fall back to global env var
  return process.env.TWILIO_AUTH_TOKEN || "";
}

/**
 * Validate a Twilio webhook request using per-subaccount auth tokens.
 *
 * Extracts `AccountSid` from the params to determine which auth token to use.
 * Falls back to the global TWILIO_AUTH_TOKEN if the org is not found.
 */
export async function validateTwilioWebhook(
  request: NextRequest,
  params: Record<string, string>,
  convex: ConvexHttpClient
): Promise<boolean> {
  const accountSid = params["AccountSid"] || null;
  const authToken = await getAuthTokenForAccount(convex, accountSid);

  if (!authToken) {
    if (process.env.NODE_ENV === "production") {
      console.error("No auth token available - rejecting webhook in production");
      return false;
    }
    console.warn("No auth token available - skipping validation (dev mode)");
    return true;
  }

  const signature = request.headers.get("X-Twilio-Signature") || "";

  // Get the full URL that Twilio used (use APP_URL for correct hostname)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.url;
  const urlPath = new URL(request.url).pathname;
  const fullUrl = appUrl.endsWith("/")
    ? `${appUrl.slice(0, -1)}${urlPath}`
    : `${appUrl}${urlPath}`;

  return twilio.validateRequest(authToken, signature, fullUrl, params);
}
