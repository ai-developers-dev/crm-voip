/**
 * Twilio A2P 10DLC Registration Service
 *
 * Wraps Trust Hub and A2P APIs for brand and campaign registration.
 * All functions take tenant's subaccount credentials (accountSid, authToken).
 */

const TRUST_HUB_BASE = "https://trusthub.twilio.com/v1";
const MESSAGING_BASE = "https://messaging.twilio.com/v1";

// Twilio's standard A2P Messaging Trust Product policy SID
// This can be looked up via GET /v1/Policies, but it's stable.
// Replace with actual policy SID from your Twilio account if needed.
const A2P_MESSAGING_POLICY_SID = "RNb0d4771c2c98518d916a3d4cd70a8f8b";

// ---------------------------------------------------------------------------
// Generic Twilio API helper
// ---------------------------------------------------------------------------

async function twilioApi<T>(
  accountSid: string,
  authToken: string,
  method: string,
  url: string,
  body?: Record<string, string>
): Promise<T> {
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });

  if (!res.ok) {
    const errorText = await res.text();
    let errorDetail: string;
    try {
      const parsed = JSON.parse(errorText);
      errorDetail = parsed.message || parsed.error_message || errorText;
    } catch {
      errorDetail = errorText;
    }
    throw new Error(`Twilio API error (${res.status}): ${errorDetail}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Brand Registration Flow
// ---------------------------------------------------------------------------

/**
 * 1. Create a Customer Profile bundle in Trust Hub
 */
export async function createCustomerProfile(
  accountSid: string,
  authToken: string,
  opts: { friendlyName: string; email: string; policyUrl?: string }
): Promise<{ customerProfileSid: string }> {
  const body: Record<string, string> = {
    FriendlyName: opts.friendlyName,
    Email: opts.email,
    PolicySid: A2P_MESSAGING_POLICY_SID,
  };
  if (opts.policyUrl) body.StatusCallback = opts.policyUrl;

  const result = await twilioApi<{ sid: string }>(
    accountSid,
    authToken,
    "POST",
    `${TRUST_HUB_BASE}/CustomerProfiles`,
    body
  );

  return { customerProfileSid: result.sid };
}

/**
 * 2. Create a Business Information End User
 */
export async function createBusinessEndUser(
  accountSid: string,
  authToken: string,
  opts: {
    businessName: string;
    businessType: string;
    ein: string;
    industryType: string;
    websiteUrl?: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    country?: string;
  }
): Promise<{ endUserSid: string }> {
  const attributes: Record<string, string> = {
    business_name: opts.businessName,
    business_type: opts.businessType,
    business_registration_identifier: opts.ein,
    business_industry: opts.industryType,
    business_regions_of_operation: "US_AND_CANADA",
    business_registration_number: opts.ein,
    social_media_profile_urls: "",
    street_address: opts.street,
    city: opts.city,
    region: opts.state,
    postal_code: opts.zip,
    iso_country: opts.country || "US",
  };
  if (opts.websiteUrl) attributes.website_url = opts.websiteUrl;

  const result = await twilioApi<{ sid: string }>(
    accountSid,
    authToken,
    "POST",
    `${TRUST_HUB_BASE}/EndUsers`,
    {
      Type: "customer_profile_business_information",
      FriendlyName: `${opts.businessName} Business Info`,
      Attributes: JSON.stringify(attributes),
    }
  );

  return { endUserSid: result.sid };
}

/**
 * 3. Create an Authorized Representative End User
 */
export async function createAuthorizedRep(
  accountSid: string,
  authToken: string,
  opts: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    title?: string;
  }
): Promise<{ endUserSid: string }> {
  const attributes: Record<string, string> = {
    first_name: opts.firstName,
    last_name: opts.lastName,
    email: opts.email,
    phone_number: opts.phone,
    business_title: opts.title || "Owner",
    job_position: opts.title || "Owner",
  };

  const result = await twilioApi<{ sid: string }>(
    accountSid,
    authToken,
    "POST",
    `${TRUST_HUB_BASE}/EndUsers`,
    {
      Type: "authorized_representative_1",
      FriendlyName: `${opts.firstName} ${opts.lastName} - Auth Rep`,
      Attributes: JSON.stringify(attributes),
    }
  );

  return { endUserSid: result.sid };
}

/**
 * 4. Assign an End User (or Supporting Document) to a Customer Profile
 */
export async function assignEndUser(
  accountSid: string,
  authToken: string,
  customerProfileSid: string,
  objectSid: string
): Promise<void> {
  await twilioApi(
    accountSid,
    authToken,
    "POST",
    `${TRUST_HUB_BASE}/CustomerProfiles/${customerProfileSid}/EntityAssignments`,
    { ObjectSid: objectSid }
  );
}

/**
 * 5. Submit Customer Profile for evaluation
 */
export async function submitCustomerProfile(
  accountSid: string,
  authToken: string,
  customerProfileSid: string
): Promise<{ evaluationSid: string }> {
  const result = await twilioApi<{ sid: string }>(
    accountSid,
    authToken,
    "POST",
    `${TRUST_HUB_BASE}/CustomerProfiles/${customerProfileSid}/Evaluations`,
    { PolicySid: A2P_MESSAGING_POLICY_SID }
  );

  return { evaluationSid: result.sid };
}

/**
 * 6. Register a Brand using the Customer Profile bundle
 */
export async function registerBrand(
  accountSid: string,
  authToken: string,
  customerProfileSid: string
): Promise<{ brandSid: string }> {
  const result = await twilioApi<{ sid: string }>(
    accountSid,
    authToken,
    "POST",
    `${MESSAGING_BASE}/a2p/BrandRegistrations`,
    {
      CustomerProfileBundleSid: customerProfileSid,
      A2PProfileBundleSid: customerProfileSid,
    }
  );

  return { brandSid: result.sid };
}

/**
 * 7. Get Brand Registration status
 */
export async function getBrandStatus(
  accountSid: string,
  authToken: string,
  brandSid: string
): Promise<{ status: string; vettingScore: number | null; failureReason: string | null }> {
  const result = await twilioApi<{
    status: string;
    brand_score: number | null;
    failure_reason: string | null;
    errors: Array<{ attribute: string; code: string }> | null;
  }>(
    accountSid,
    authToken,
    "GET",
    `${MESSAGING_BASE}/a2p/BrandRegistrations/${brandSid}`
  );

  return {
    status: result.status,
    vettingScore: result.brand_score ?? null,
    failureReason: result.failure_reason ?? (result.errors ? JSON.stringify(result.errors) : null),
  };
}

// ---------------------------------------------------------------------------
// Campaign Registration Flow
// ---------------------------------------------------------------------------

/**
 * 8. Create a Messaging Service
 */
export async function createMessagingService(
  accountSid: string,
  authToken: string,
  friendlyName: string
): Promise<{ serviceSid: string }> {
  const result = await twilioApi<{ sid: string }>(
    accountSid,
    authToken,
    "POST",
    `${MESSAGING_BASE}/Services`,
    {
      FriendlyName: friendlyName,
      UseInboundWebhookOnNumber: "true",
    }
  );

  return { serviceSid: result.sid };
}

/**
 * 9. Add a phone number to a Messaging Service
 */
export async function addNumberToService(
  accountSid: string,
  authToken: string,
  serviceSid: string,
  phoneNumberSid: string
): Promise<void> {
  await twilioApi(
    accountSid,
    authToken,
    "POST",
    `${MESSAGING_BASE}/Services/${serviceSid}/PhoneNumbers`,
    { PhoneNumberSid: phoneNumberSid }
  );
}

/**
 * 10. Register a Campaign (US A2P 10DLC)
 */
export async function registerCampaign(
  accountSid: string,
  authToken: string,
  serviceSid: string,
  opts: {
    brandRegistrationSid: string;
    useCase: string;
    description: string;
    sampleMessages: string[];
    messageFlow: string;
    helpMessage: string;
    optInMessage: string;
    optOutMessage: string;
    hasEmbeddedLinks: boolean;
    hasEmbeddedPhone: boolean;
  }
): Promise<{ campaignSid: string }> {
  const result = await twilioApi<{ us_app_to_person_usecase: string; sid: string }>(
    accountSid,
    authToken,
    "POST",
    `${MESSAGING_BASE}/Services/${serviceSid}/UsAppToPerson`,
    {
      BrandRegistrationSid: opts.brandRegistrationSid,
      UseCase: opts.useCase,
      Description: opts.description,
      MessageSamples: JSON.stringify(opts.sampleMessages),
      MessageFlow: opts.messageFlow,
      HelpMessage: opts.helpMessage,
      OptInMessage: opts.optInMessage,
      OptOutMessage: opts.optOutMessage,
      HasEmbeddedLinks: opts.hasEmbeddedLinks.toString(),
      HasEmbeddedPhone: opts.hasEmbeddedPhone.toString(),
    }
  );

  return { campaignSid: result.sid };
}

/**
 * 11. Get Campaign Registration status
 */
export async function getCampaignStatus(
  accountSid: string,
  authToken: string,
  serviceSid: string,
  campaignSid: string
): Promise<{ status: string; throughput: number | null; failureReason: string | null }> {
  const result = await twilioApi<{
    campaign_status: string;
    rate_limits: Record<string, unknown> | null;
    failure_reason: string | null;
  }>(
    accountSid,
    authToken,
    "GET",
    `${MESSAGING_BASE}/Services/${serviceSid}/UsAppToPerson/${campaignSid}`
  );

  // Extract MPS (messages per second) from rate limits if available
  let throughput: number | null = null;
  if (result.rate_limits && typeof result.rate_limits === "object") {
    const mps = Object.values(result.rate_limits).find(
      (v) => typeof v === "number"
    );
    if (typeof mps === "number") throughput = mps;
  }

  return {
    status: result.campaign_status,
    throughput,
    failureReason: result.failure_reason ?? null,
  };
}
