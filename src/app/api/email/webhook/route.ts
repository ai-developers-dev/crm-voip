import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import crypto from "crypto";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Verify Nylas webhook signature
function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.NYLAS_WEBHOOK_SECRET;
  if (!secret) return false;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  const digest = hmac.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

// Nylas webhook challenge verification (GET)
export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get("challenge");
  if (challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ status: "ok" });
}

// Handle incoming webhook events (POST)
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Verify signature
    const signature = request.headers.get("x-nylas-signature") || "";
    if (process.env.NYLAS_WEBHOOK_SECRET && !verifyWebhookSignature(rawBody, signature)) {
      console.error("Invalid Nylas webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const { type, data } = payload;

    if (type === "message.created") {
      await handleMessageCreated(data);
    } else if (type === "message.updated") {
      // Could handle read receipts, label changes, etc.
      console.log("Message updated:", data?.object?.id);
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Email webhook error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

async function handleMessageCreated(data: Record<string, unknown>) {
  const messageData = data?.object as Record<string, unknown> | undefined;
  if (!messageData) return;

  const nylasMessageId = messageData.id as string;
  const grantId = messageData.grant_id as string || (data.grant_id as string);

  if (!nylasMessageId || !grantId) {
    console.error("Missing message ID or grant ID in webhook");
    return;
  }

  // Check for duplicate
  const existing = await convex.query(api.emails.getByNylasMessageId, {
    nylasMessageId,
  });
  if (existing) return; // Already processed

  // Find the email account by grant ID
  const emailAccount = await convex.query(api.emailAccounts.getByNylasGrant, {
    nylasGrantId: grantId,
  });
  if (!emailAccount) {
    console.error(`No email account found for grant ${grantId}`);
    return;
  }

  // Extract message fields
  const fromArr = messageData.from as Array<{ email: string; name?: string }> | undefined;
  const toArr = messageData.to as Array<{ email: string; name?: string }> | undefined;
  const ccArr = messageData.cc as Array<{ email: string; name?: string }> | undefined;
  const subject = (messageData.subject as string) || "(No Subject)";
  const body = messageData.body as string | undefined;
  const snippet = messageData.snippet as string | undefined;
  const date = messageData.date as number | undefined;
  const threadId = messageData.thread_id as string | undefined;
  const files = messageData.attachments as Array<{
    id: string;
    filename: string;
    content_type: string;
    size: number;
  }> | undefined;

  const fromEmail = fromArr?.[0]?.email || "unknown";
  const toEmails = toArr?.map((r) => r.email) || [];
  const ccEmails = ccArr?.map((r) => r.email) || [];

  // Determine direction: if "from" matches our account email, it's outbound
  const isOutbound = fromEmail.toLowerCase() === emailAccount.email.toLowerCase();

  // Try to match contact by email
  const contactEmail = isOutbound ? toEmails[0] : fromEmail;
  let contactId: Id<"contacts"> | undefined;

  if (contactEmail) {
    const contact = await convex.query(api.emails.matchContactByEmail, {
      organizationId: emailAccount.organizationId,
      emailAddress: contactEmail,
    });
    if (contact) {
      contactId = contact._id;
    }
  }

  // Build attachments array
  const attachments = files?.map((f) => ({
    fileName: f.filename || "attachment",
    contentType: f.content_type || "application/octet-stream",
    size: f.size || 0,
    nylasFileId: f.id,
  }));

  // Save email to Convex
  await convex.mutation(api.emails.create, {
    organizationId: emailAccount.organizationId,
    contactId,
    emailAccountId: emailAccount._id,
    nylasMessageId,
    threadId,
    direction: isOutbound ? "outbound" : "inbound",
    from: fromEmail,
    to: toEmails,
    cc: ccEmails.length > 0 ? ccEmails : undefined,
    subject,
    bodyPlain: body, // Nylas returns HTML in body field
    bodyHtml: body,
    snippet,
    hasAttachments: (files?.length ?? 0) > 0,
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
    status: "delivered",
    sentAt: date ? date * 1000 : Date.now(), // Nylas sends unix timestamp in seconds
  });

  console.log(`Saved ${isOutbound ? "outbound" : "inbound"} email ${nylasMessageId} for org ${emailAccount.organizationId}`);
}
