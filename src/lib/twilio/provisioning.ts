/**
 * Twilio Subaccount Provisioning Service
 *
 * Creates subaccounts, API keys, and TwiML apps for new tenants
 * under the platform's master Twilio account.
 */

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

async function twilioFetch<T>(
  accountSid: string,
  authToken: string,
  method: string,
  path: string,
  body?: Record<string, string>
): Promise<T> {
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(`${TWILIO_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Twilio API error (${res.status}): ${error}`);
  }

  return res.json();
}

/**
 * Create a Twilio subaccount under the master account.
 */
export async function createSubaccount(
  masterSid: string,
  masterAuth: string,
  friendlyName: string
): Promise<{ accountSid: string; authToken: string }> {
  const result = await twilioFetch<Record<string, unknown>>(
    masterSid,
    masterAuth,
    "POST",
    `/Accounts.json`,
    { FriendlyName: friendlyName }
  );
  return {
    accountSid: result.sid as string,
    authToken: result.auth_token as string,
  };
}

/**
 * Create an API Key under a subaccount (required for Voice SDK tokens).
 */
export async function createApiKey(
  subAccountSid: string,
  subAuthToken: string,
  friendlyName: string
): Promise<{ sid: string; secret: string }> {
  const result = await twilioFetch<Record<string, unknown>>(
    subAccountSid,
    subAuthToken,
    "POST",
    `/Accounts/${subAccountSid}/Keys.json`,
    { FriendlyName: friendlyName }
  );
  return {
    sid: result.sid as string,
    secret: result.secret as string,
  };
}

/**
 * Create a TwiML App under a subaccount (required for outbound calls from browser).
 */
export async function createTwimlApp(
  subAccountSid: string,
  subAuthToken: string,
  config: { voiceUrl: string; statusCallbackUrl: string; friendlyName: string }
): Promise<{ sid: string }> {
  const result = await twilioFetch<Record<string, unknown>>(
    subAccountSid,
    subAuthToken,
    "POST",
    `/Accounts/${subAccountSid}/Applications.json`,
    {
      FriendlyName: config.friendlyName,
      VoiceUrl: config.voiceUrl,
      VoiceMethod: "POST",
      StatusCallback: config.statusCallbackUrl,
      StatusCallbackMethod: "POST",
    }
  );
  return { sid: result.sid as string };
}

/**
 * Full tenant provisioning: subaccount + API key + TwiML app.
 * Returns all credentials needed for the tenant's phone system.
 */
export async function provisionTenant(
  masterSid: string,
  masterAuth: string,
  tenantName: string,
  appUrl: string
): Promise<{
  accountSid: string;
  authToken: string;
  apiKey: string;
  apiSecret: string;
  twimlAppSid: string;
}> {
  // 1. Create subaccount
  const sub = await createSubaccount(masterSid, masterAuth, `CRM: ${tenantName}`);

  // 2. Create API Key under subaccount
  const key = await createApiKey(sub.accountSid, sub.authToken, `${tenantName} Voice SDK`);

  // 3. Create TwiML App under subaccount
  const app = await createTwimlApp(sub.accountSid, sub.authToken, {
    friendlyName: `${tenantName} CRM`,
    voiceUrl: `${appUrl}/api/twilio/voice`,
    statusCallbackUrl: `${appUrl}/api/twilio/status`,
  });

  return {
    accountSid: sub.accountSid,
    authToken: sub.authToken,
    apiKey: key.sid,
    apiSecret: key.secret,
    twimlAppSid: app.sid,
  };
}

/**
 * Search available phone numbers by area code.
 */
export async function searchAvailableNumbers(
  accountSid: string,
  authToken: string,
  options: {
    country?: string;
    areaCode?: string;
    contains?: string;
    type?: "local" | "tollFree" | "mobile";
    limit?: number;
  }
): Promise<Array<{
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  capabilities: { voice: boolean; SMS: boolean; MMS: boolean };
}>> {
  const { country = "US", areaCode, contains, type = "local", limit = 20 } = options;
  const typeMap = { local: "Local", tollFree: "TollFree", mobile: "Mobile" };
  const params = new URLSearchParams();
  if (areaCode) params.set("AreaCode", areaCode);
  if (contains) params.set("Contains", contains);
  params.set("PageSize", String(limit));

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(
    `${TWILIO_API_BASE}/Accounts/${accountSid}/AvailablePhoneNumbers/${country}/${typeMap[type]}.json?${params}`,
    { headers: { Authorization: `Basic ${auth}` } }
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to search numbers: ${error}`);
  }

  const data = await res.json();
  return (data.available_phone_numbers || []).map((n: any) => ({
    phoneNumber: n.phone_number,
    friendlyName: n.friendly_name,
    locality: n.locality || "",
    region: n.region || "",
    capabilities: {
      voice: n.capabilities?.voice ?? true,
      SMS: n.capabilities?.SMS ?? true,
      MMS: n.capabilities?.MMS ?? false,
    },
  }));
}

/**
 * Purchase a phone number under a subaccount.
 */
export async function purchasePhoneNumber(
  subAccountSid: string,
  subAuthToken: string,
  phoneNumber: string,
  config: { voiceUrl: string; smsUrl: string; friendlyName?: string }
): Promise<{ sid: string; phoneNumber: string; friendlyName: string }> {
  const result = await twilioFetch<Record<string, unknown>>(
    subAccountSid,
    subAuthToken,
    "POST",
    `/Accounts/${subAccountSid}/IncomingPhoneNumbers.json`,
    {
      PhoneNumber: phoneNumber,
      VoiceUrl: config.voiceUrl,
      VoiceMethod: "POST",
      SmsUrl: config.smsUrl,
      SmsMethod: "POST",
      ...(config.friendlyName && { FriendlyName: config.friendlyName }),
    }
  );
  return {
    sid: result.sid as string,
    phoneNumber: result.phone_number as string,
    friendlyName: result.friendly_name as string,
  };
}

/**
 * Release (delete) a phone number.
 */
export async function releasePhoneNumber(
  subAccountSid: string,
  subAuthToken: string,
  phoneNumberSid: string
): Promise<void> {
  const auth = Buffer.from(`${subAccountSid}:${subAuthToken}`).toString("base64");
  const res = await fetch(
    `${TWILIO_API_BASE}/Accounts/${subAccountSid}/IncomingPhoneNumbers/${phoneNumberSid}.json`,
    { method: "DELETE", headers: { Authorization: `Basic ${auth}` } }
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to release number: ${res.status}`);
  }
}

/**
 * Look up a phone number on the master account by its E.164 number.
 * Used when an admin pastes a human-readable number and we need the PN SID.
 * Returns null if the number is not found on the master account.
 */
export async function lookupNumberOnMaster(
  masterSid: string,
  masterAuth: string,
  phoneNumber: string
): Promise<{ sid: string; phoneNumber: string; friendlyName: string } | null> {
  const params = new URLSearchParams({ PhoneNumber: phoneNumber });
  const auth = Buffer.from(`${masterSid}:${masterAuth}`).toString("base64");
  const res = await fetch(
    `${TWILIO_API_BASE}/Accounts/${masterSid}/IncomingPhoneNumbers.json?${params}`,
    { headers: { Authorization: `Basic ${auth}` } }
  );

  if (!res.ok) {
    throw new Error(`Failed to look up number: ${res.status}`);
  }

  const data = await res.json();
  const list = (data.incoming_phone_numbers || []) as Array<Record<string, unknown>>;
  if (list.length === 0) return null;

  const first = list[0];
  return {
    sid: first.sid as string,
    phoneNumber: first.phone_number as string,
    friendlyName: (first.friendly_name as string) || "",
  };
}

/**
 * Transfer an IncomingPhoneNumber from the master account into a subaccount
 * using Twilio's in-place reassign. The PN SID does not change.
 *
 * Also updates voice/SMS/status webhook URLs in the same call so the number
 * points at the platform's webhook routes after the transfer.
 */
export async function transferPhoneNumberToSubaccount(
  masterSid: string,
  masterAuth: string,
  phoneNumberSid: string,
  targetSubaccountSid: string,
  webhooks: { voiceUrl: string; smsUrl: string; statusCallbackUrl: string }
): Promise<{ sid: string; phoneNumber: string; friendlyName: string }> {
  const result = await twilioFetch<Record<string, unknown>>(
    masterSid,
    masterAuth,
    "POST",
    `/Accounts/${masterSid}/IncomingPhoneNumbers/${phoneNumberSid}.json`,
    {
      AccountSid: targetSubaccountSid,
      VoiceUrl: webhooks.voiceUrl,
      VoiceMethod: "POST",
      SmsUrl: webhooks.smsUrl,
      SmsMethod: "POST",
      StatusCallback: webhooks.statusCallbackUrl,
      StatusCallbackMethod: "POST",
    }
  );
  return {
    sid: result.sid as string,
    phoneNumber: result.phone_number as string,
    friendlyName: (result.friendly_name as string) || "",
  };
}

/**
 * Full Twilio IncomingPhoneNumber config — matches the fields available in
 * the Twilio Console "Voice Configuration" and "Messaging Configuration" tabs.
 * All fields are optional; only set keys are sent to Twilio.
 */
export interface TwilioPhoneNumberConfig {
  // Voice
  voiceUrl?: string;
  voiceMethod?: "POST" | "GET";
  voiceFallbackUrl?: string;
  voiceFallbackMethod?: "POST" | "GET";
  statusCallbackUrl?: string;
  statusCallbackMethod?: "POST" | "GET";
  voiceCallerIdLookup?: boolean;
  voiceReceiveMode?: "voice" | "fax";
  // Messaging
  smsUrl?: string;
  smsMethod?: "POST" | "GET";
  smsFallbackUrl?: string;
  smsFallbackMethod?: "POST" | "GET";
}

/**
 * Update any subset of an IncomingPhoneNumber's configuration under the
 * given subaccount. Uses Twilio's POST-to-resource update API.
 *
 * Empty strings ARE sent through — Twilio treats an empty string as
 * "clear this field", which is intentional for the admin config UI.
 */
export async function updatePhoneNumberConfig(
  subAccountSid: string,
  subAuthToken: string,
  phoneNumberSid: string,
  config: TwilioPhoneNumberConfig
): Promise<{ sid: string; phoneNumber: string; friendlyName: string }> {
  const body: Record<string, string> = {};

  if (config.voiceUrl !== undefined) body.VoiceUrl = config.voiceUrl;
  if (config.voiceMethod) body.VoiceMethod = config.voiceMethod;
  if (config.voiceFallbackUrl !== undefined) body.VoiceFallbackUrl = config.voiceFallbackUrl;
  if (config.voiceFallbackMethod) body.VoiceFallbackMethod = config.voiceFallbackMethod;
  if (config.statusCallbackUrl !== undefined) body.StatusCallback = config.statusCallbackUrl;
  if (config.statusCallbackMethod) body.StatusCallbackMethod = config.statusCallbackMethod;
  if (config.voiceCallerIdLookup !== undefined) body.VoiceCallerIdLookup = String(config.voiceCallerIdLookup);
  if (config.voiceReceiveMode) body.VoiceReceiveMode = config.voiceReceiveMode;

  if (config.smsUrl !== undefined) body.SmsUrl = config.smsUrl;
  if (config.smsMethod) body.SmsMethod = config.smsMethod;
  if (config.smsFallbackUrl !== undefined) body.SmsFallbackUrl = config.smsFallbackUrl;
  if (config.smsFallbackMethod) body.SmsFallbackMethod = config.smsFallbackMethod;

  const result = await twilioFetch<Record<string, unknown>>(
    subAccountSid,
    subAuthToken,
    "POST",
    `/Accounts/${subAccountSid}/IncomingPhoneNumbers/${phoneNumberSid}.json`,
    body
  );

  return {
    sid: result.sid as string,
    phoneNumber: result.phone_number as string,
    friendlyName: (result.friendly_name as string) || "",
  };
}
