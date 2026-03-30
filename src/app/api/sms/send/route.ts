import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import twilio from "twilio";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      to,
      messageBody,
      mediaUrls,
      organizationId,
      fromNumber,
      contactId,
      assignedUserId,
    } = body;

    // Validate required fields
    if (!to || !messageBody || !organizationId || !fromNumber) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: to, messageBody, organizationId, fromNumber" },
        { status: 400 }
      );
    }

    // Get organization to check for Twilio credentials
    const organization = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<"organizations">,
    });

    if (!organization) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    // Determine which Twilio credentials to use
    let accountSid: string;
    let authToken: string;

    if (organization.settings.twilioCredentials?.isConfigured) {
      // Use tenant's own Twilio credentials
      accountSid = organization.settings.twilioCredentials.accountSid;
      authToken = organization.settings.twilioCredentials.authToken;
    } else {
      // Fall back to platform Twilio credentials
      accountSid = process.env.TWILIO_ACCOUNT_SID!;
      authToken = process.env.TWILIO_AUTH_TOKEN!;
    }

    if (!accountSid || !authToken) {
      return NextResponse.json(
        { success: false, error: "Twilio credentials not configured" },
        { status: 500 }
      );
    }

    // ── Pre-send opt-out check ──────────────────────────────────────
    if (contactId) {
      const contact = await convex.query(api.contacts.getById, {
        contactId: contactId as Id<"contacts">,
      });
      if (contact?.smsOptedOut) {
        return NextResponse.json(
          { success: false, error: "This contact has opted out of SMS. They must reply START to re-subscribe." },
          { status: 400 }
        );
      }
    }

    // ── First message compliance ────────────────────────────────────
    // Check if there is an existing conversation with this number
    const existingConversation = await convex.query(api.sms.getConversationByPhones, {
      organizationId: organizationId as Id<"organizations">,
      customerPhoneNumber: to,
      businessPhoneNumber: fromNumber,
    });

    let finalMessageBody = messageBody;
    if (!existingConversation) {
      // First message to this number — append opt-out language
      finalMessageBody += "\n\nReply STOP to opt out. Msg & data rates may apply.";

      // Log first message consent event (fire-and-forget)
      convex.mutation(api.smsConsent.log, {
        organizationId: organizationId as Id<"organizations">,
        contactId: contactId ? (contactId as Id<"contacts">) : undefined,
        phoneNumber: to,
        action: "first_message",
        source: "outbound_sms",
      }).catch((err) => console.error("Error logging first message consent:", err));
    }

    // Save message to database first (optimistic - with "queued" status)
    const { messageId, conversationId } = await convex.mutation(api.sms.sendMessage, {
      organizationId: organizationId as Id<"organizations">,
      to,
      from: fromNumber,
      body: finalMessageBody,
      mediaUrls,
      contactId: contactId as Id<"contacts"> | undefined,
      assignedUserId: assignedUserId as Id<"users"> | undefined,
    });

    console.log(`Created message ${messageId} in conversation ${conversationId}`);

    // Create Twilio client and send message
    const client = twilio(accountSid, authToken);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    try {
      // Check for A2P messaging service (10DLC compliant)
      const a2pServiceSid = (organization.settings as any)?.a2pMessagingServiceSid as string | undefined;

      let twilioMessageOptions: {
        from?: string;
        messagingServiceSid?: string;
        to: string;
        body: string;
        statusCallback?: string;
        mediaUrl?: string[];
      };

      if (a2pServiceSid) {
        // Use Messaging Service (A2P compliant) — Twilio picks the best number automatically
        twilioMessageOptions = {
          messagingServiceSid: a2pServiceSid,
          to,
          body: finalMessageBody,
          statusCallback: `${appUrl}/api/twilio/sms-status`,
        };
      } else {
        // Fall back to direct from number
        twilioMessageOptions = {
          from: fromNumber,
          to,
          body: finalMessageBody,
          statusCallback: `${appUrl}/api/twilio/sms-status`,
        };
      }

      // Add media URLs for MMS if provided
      if (mediaUrls && mediaUrls.length > 0) {
        twilioMessageOptions.mediaUrl = mediaUrls;
      }

      const twilioMessage = await client.messages.create(twilioMessageOptions);

      console.log(`Twilio message sent: ${twilioMessage.sid}, status: ${twilioMessage.status}`);

      // Update message with Twilio SID and status
      await convex.mutation(api.sms.updateTwilioSid, {
        messageId,
        twilioMessageSid: twilioMessage.sid,
        status: twilioMessage.status as "queued" | "sending" | "sent" | "delivered" | "failed" | "undelivered",
      });

      return NextResponse.json({
        success: true,
        messageId,
        conversationId,
        twilioMessageSid: twilioMessage.sid,
        status: twilioMessage.status,
      });
    } catch (twilioError) {
      console.error("Twilio send error:", twilioError);

      // Update message status to failed
      await convex.mutation(api.sms.updateStatus, {
        twilioMessageSid: `pending-${Date.now()}`, // Use temp ID since we haven't updated yet
        status: "failed",
        errorCode: (twilioError as Record<string, unknown>).code?.toString(),
        errorMessage: (twilioError as Error).message,
      });

      // Try to update the message directly
      await convex.mutation(api.sms.updateTwilioSid, {
        messageId,
        twilioMessageSid: `failed-${Date.now()}`,
        status: "failed",
      });

      return NextResponse.json(
        {
          success: false,
          error: "Failed to send SMS",
          details: (twilioError as Error).message,
          messageId,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("SMS send API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
