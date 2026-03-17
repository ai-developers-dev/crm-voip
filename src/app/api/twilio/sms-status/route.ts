import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";

// Convex HTTP client for database operations
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: NextRequest) {
  let messageSid = "unknown";

  try {
    const formData = await request.formData();

    // Parse Twilio status callback data
    messageSid = formData.get("MessageSid") as string;
    const status = formData.get("MessageStatus") as string;
    const errorCode = formData.get("ErrorCode") as string | null;
    const errorMessage = formData.get("ErrorMessage") as string | null;
    const to = formData.get("To") as string | null;
    const from = formData.get("From") as string | null;

    // Convert FormData to params object for validation
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Validate webhook signature (per-subaccount auth token lookup)
    const isValid = await validateTwilioWebhook(request, params, convex);
    if (!isValid) {
      console.error("Invalid Twilio webhook signature for SMS status callback");
      return new NextResponse("Forbidden", { status: 403 });
    }

    console.log(`SMS status callback: ${messageSid} -> ${status}`);
    if (errorCode) {
      console.error(`SMS error: ${errorCode} - ${errorMessage}`);
    }

    // ── Handle error 21610 (recipient opted out on Twilio's side) ───
    if (errorCode === "21610" && to && from) {
      console.log(`Error 21610: Recipient ${to} has opted out. Syncing to database.`);
      try {
        // "from" is our Twilio number (we sent the message), look up org by it
        const phoneConfig = await convex.query(api.phoneNumbers.lookupByNumber, { phoneNumber: from });
        if (phoneConfig) {
          const orgId = phoneConfig.organizationId as Id<"organizations">;
          const contactId = await convex.mutation(api.sms.handleOptOut, {
            phoneNumber: to,
            organizationId: orgId,
          });
          // Log consent event
          await convex.mutation(api.smsConsent.log, {
            organizationId: orgId,
            contactId: contactId || undefined,
            phoneNumber: to,
            action: "error_21610",
            source: "status_callback",
          });
        }
      } catch (err) {
        console.error("Error handling 21610 opt-out sync:", err);
      }
    }

    // Update message status in database
    const result = await convex.mutation(api.sms.updateStatus, {
      twilioMessageSid: messageSid,
      status,
      errorCode: errorCode || undefined,
      errorMessage: errorMessage || undefined,
    });

    if (!result.success) {
      console.log(`Status update skipped for ${messageSid}: ${result.reason}`);
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[${errorId}] SMS status callback error:`, {
      messageSid,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Return 200 to prevent Twilio retries
    return new NextResponse("OK", { status: 200 });
  }
}

// Handle GET for testing
export async function GET() {
  return new NextResponse("SMS status callback endpoint is working", {
    status: 200,
  });
}
