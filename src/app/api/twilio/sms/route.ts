import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

// Convex HTTP client for database operations
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Validate Twilio webhook signature
async function validateTwilioRequest(
  request: NextRequest,
  params: Record<string, string>
): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn("TWILIO_AUTH_TOKEN not set - skipping validation");
    return true; // Allow in development without auth token
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

    // Validate webhook signature
    const isValid = await validateTwilioRequest(request, params);
    if (!isValid) {
      console.error("Invalid Twilio webhook signature for SMS webhook");
      return new NextResponse("Forbidden", { status: 403 });
    }

    console.log(`SMS webhook: ${messageSid} from ${from} to ${to}`);
    console.log(`Message body: ${body.substring(0, 100)}${body.length > 100 ? "..." : ""}`);

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

    // Save to Convex
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
