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
  const result = await twilioFetch<any>(
    masterSid,
    masterAuth,
    "POST",
    `/Accounts.json`,
    { FriendlyName: friendlyName }
  );
  return {
    accountSid: result.sid,
    authToken: result.auth_token,
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
  const result = await twilioFetch<any>(
    subAccountSid,
    subAuthToken,
    "POST",
    `/Accounts/${subAccountSid}/Keys.json`,
    { FriendlyName: friendlyName }
  );
  return {
    sid: result.sid,
    secret: result.secret,
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
  const result = await twilioFetch<any>(
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
  return { sid: result.sid };
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
  const result = await twilioFetch<any>(
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
    sid: result.sid,
    phoneNumber: result.phone_number,
    friendlyName: result.friendly_name,
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
