import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import twilio from "twilio";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";

const VoiceResponse = twilio.twiml.VoiceResponse;


// Format phone number to E.164
function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");

  // If already has country code (11 digits starting with 1)
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  // US number without country code
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // Return as-is with + if it looks like it might be international
  return phone.startsWith("+") ? phone : `+${digits}`;
}

export async function POST(request: NextRequest) {
  let callSid = "unknown";

  try {
    const formData = await request.formData();
    callSid = formData.get("CallSid") as string;
    const to = formData.get("To") as string;
    const from = formData.get("From") as string; // This is the browser client identity
    const organizationId = formData.get("OrganizationId") as string;
    const contactName = formData.get("ContactName") as string;

    // Convert FormData to params object for validation
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Validate webhook signature (per-subaccount auth token lookup)
    const isValid = await validateTwilioWebhook(request, params, convex);
    if (!isValid) {
      console.error("Invalid Twilio webhook signature for outbound webhook");
      return new NextResponse("Forbidden", { status: 403 });
    }

    console.log(`Outbound call webhook: ${callSid} to ${to} from ${from}`);

    // Format the destination number
    const formattedTo = formatPhoneNumber(to);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    // Determine caller ID: use org's configured phone number, not browser client identity
    let twilioNumber = process.env.TWILIO_PHONE_NUMBER || "";
    try {
      // Parse org ID from client identity: "client:org_xxx-user_xxx" or "org_xxx-user_xxx"
      const clientIdentity = from?.startsWith("client:") ? from.replace("client:", "") : from;
      const clerkOrgId = clientIdentity?.split("-user_")[0];
      if (clerkOrgId) {
        const org = await convex.query(api.organizations.getCurrent, { clerkOrgId });
        if (org) {
          const phoneNumbers = await convex.query(api.phoneNumbers.getByOrganization, {
            organizationId: org._id,
          });
          if (phoneNumbers.length > 0) {
            twilioNumber = phoneNumbers[0].phoneNumber;
          }
        }
      }
    } catch (err) {
      console.warn("Failed to fetch org phone number for caller ID, using env fallback:", err);
    }

    // Parse clerkUserId from the identity (format: clerkOrgId-clerkUserId)
    // The "from" field contains the Twilio client identity
    let userId: Id<"users"> | undefined;
    if (from && from.includes("-") && organizationId) {
      const parts = from.split("-");
      if (parts.length >= 2) {
        const clerkUserId = parts.slice(1).join("-"); // Handle IDs with dashes
        try {
          const user = await convex.query(api.users.getByClerkId, {
            clerkUserId,
            organizationId: organizationId as Id<"organizations">,
          });
          if (user) {
            userId = user._id;
            console.log(`Identified outbound caller: ${user.name} (${userId})`);
          }
        } catch (error) {
          console.error("Failed to lookup user for outbound call:", error);
        }
      }
    }

    // Create outbound call record in Convex if organizationId provided
    if (organizationId) {
      try {
        await convex.mutation(api.calls.createOutgoing, {
          organizationId: organizationId as Id<"organizations">,
          twilioCallSid: callSid,
          from: twilioNumber || from,
          to: formattedTo,
          toName: contactName || undefined,
          userId, // Track who made the outbound call
        });
      } catch (error) {
        console.error("Failed to create outbound call record:", error);
        // Continue anyway - call can still proceed
      }
    }

    // Generate TwiML to dial the number
    const twiml = new VoiceResponse();
    const dial = twiml.dial({
      callerId: twilioNumber || process.env.TWILIO_CALLER_ID,
      timeout: 30,
      action: `${appUrl}/api/twilio/outbound-status`,
      record: "record-from-answer-dual",
      recordingStatusCallback: `${appUrl}/api/twilio/recording`,
    });

    dial.number(
      {
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallback: `${appUrl}/api/twilio/status`,
      },
      formattedTo
    );

    const twimlString = twiml.toString();
    console.log("Outbound TwiML:", twimlString.substring(0, 200) + "...");

    return new NextResponse(twimlString, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[${errorId}] Outbound webhook error:`, {
      callSid,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });

    // Return TwiML error
    const twiml = new VoiceResponse();
    twiml.say("We're sorry, an error occurred placing your call. Please try again.");
    twiml.hangup();

    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}
