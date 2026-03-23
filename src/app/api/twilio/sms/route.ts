import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";

// Convex HTTP client for database operations
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const OPT_OUT_KEYWORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout"];
const OPT_IN_KEYWORDS = ["start", "yes", "unstop"];

export async function POST(request: NextRequest) {
  let messageSid = "unknown";

  try {
    const formData = await request.formData();

    // Parse Twilio webhook data
    messageSid = formData.get("MessageSid") as string;
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const body = formData.get("Body") as string;
    const numSegments = parseInt(formData.get("NumSegments") as string || "1");

    // Convert FormData to params object for validation
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Validate webhook signature (per-subaccount auth token lookup)
    const isValid = await validateTwilioWebhook(request, params, convex);
    if (!isValid) {
      console.error("Invalid Twilio webhook signature for SMS webhook");
      return new NextResponse("Forbidden", { status: 403 });
    }

    console.log(`SMS webhook: ${messageSid} from ${from} to ${to}`);
    console.log(`Message body: ${body.substring(0, 100)}${body.length > 100 ? "..." : ""}`);

    // ── Opt-out / Opt-in keyword detection ──────────────────────────
    const bodyLower = (body || "").toLowerCase().trim();

    if (OPT_OUT_KEYWORDS.includes(bodyLower)) {
      console.log(`SMS opt-out keyword detected: "${bodyLower}" from ${from}`);
      try {
        // Look up organization by the Twilio number (to)
        const phoneConfig = await convex.query(api.phoneNumbers.lookupByNumber, { phoneNumber: to });
        if (phoneConfig) {
          const orgId = phoneConfig.organizationId as Id<"organizations">;
          const contactId = await convex.mutation(api.sms.handleOptOut, {
            phoneNumber: from,
            organizationId: orgId,
          });
          // Log consent event
          await convex.mutation(api.smsConsent.log, {
            organizationId: orgId,
            contactId: contactId || undefined,
            phoneNumber: from,
            action: "opt_out",
            keyword: bodyLower,
            source: "inbound_sms",
          });
        }
      } catch (err) {
        console.error("Error handling SMS opt-out:", err);
      }
    }

    if (OPT_IN_KEYWORDS.includes(bodyLower)) {
      console.log(`SMS opt-in keyword detected: "${bodyLower}" from ${from}`);
      try {
        const phoneConfig = await convex.query(api.phoneNumbers.lookupByNumber, { phoneNumber: to });
        if (phoneConfig) {
          const orgId = phoneConfig.organizationId as Id<"organizations">;
          const contactId = await convex.mutation(api.sms.handleOptIn, {
            phoneNumber: from,
            organizationId: orgId,
          });
          // Log consent event
          await convex.mutation(api.smsConsent.log, {
            organizationId: orgId,
            contactId: contactId || undefined,
            phoneNumber: from,
            action: "opt_in",
            keyword: bodyLower,
            source: "inbound_sms",
          });
        }
      } catch (err) {
        console.error("Error handling SMS opt-in:", err);
      }
    }

    // Parse MMS attachments
    const numMedia = parseInt(formData.get("NumMedia") as string || "0");
    const mediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const url = formData.get(`MediaUrl${i}`);
      if (url) {
        mediaUrls.push(url as string);
        console.log(`Media attachment ${i}: ${url}`);
      }
    }

    // Save to Convex (always save message so it shows in conversation timeline)
    const result = await convex.mutation(api.sms.receiveMessage, {
      twilioMessageSid: messageSid,
      from,
      to,
      body: body || "",
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      numSegments,
    });

    if (!result.success) {
      console.error(`Failed to save inbound SMS: ${result.reason}`);
    } else {
      console.log(`Inbound SMS saved: messageId=${result.messageId}, conversationId=${result.conversationId}`);

      // ── AI SMS Agent routing (fire-and-forget) ──────────────────────
      // Check if this contact has an active AI conversation
      if (result.contactId && result.organizationId && !OPT_OUT_KEYWORDS.includes(bodyLower)) {
        try {
          const aiConversation = await convex.query(api.smsAgents.getActiveAiConversationForContact, {
            contactId: result.contactId as Id<"contacts">,
            organizationId: result.organizationId as Id<"organizations">,
          });

          if (aiConversation) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
            // Non-blocking: route to AI engine
            fetch(`${appUrl}/api/sms/ai`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agentConversationId: aiConversation._id,
                incomingMessage: body,
                organizationId: result.organizationId,
                contactId: result.contactId,
              }),
            }).catch((err) => console.error("AI SMS routing error:", err));
          }
        } catch (err) {
          console.error("AI SMS lookup error:", err);
        }
      }
    }

    // MUST return TwiML (even empty) with 200 status
    // This tells Twilio we received the message successfully
    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[${errorId}] SMS webhook error:`, {
      messageSid,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Still return 200 with empty TwiML to prevent Twilio retries
    // Log the error but don't fail the webhook
    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      headers: { "Content-Type": "text/xml" },
    });
  }
}

// Handle GET for testing
export async function GET() {
  return new NextResponse('<?xml version="1.0"?><Response><Message>SMS webhook is working</Message></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}
