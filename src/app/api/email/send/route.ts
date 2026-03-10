import { NextRequest, NextResponse } from "next/server";
import Nylas from "nylas";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY!,
  apiUri: process.env.NYLAS_API_URI || "https://api.us.nylas.com",
});

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      organizationId,
      emailAccountId,
      to,
      cc,
      bcc,
      subject,
      bodyPlain,
      bodyHtml,
      contactId,
      nylasGrantId,
    } = body;

    // Validate required fields
    if (!organizationId || !to || !subject || !nylasGrantId || !emailAccountId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: organizationId, to, subject, nylasGrantId, emailAccountId" },
        { status: 400 }
      );
    }

    // Get the email account to use as "from"
    const emailAccount = await convex.query(api.emailAccounts.getByNylasGrant, {
      nylasGrantId,
    });

    if (!emailAccount || emailAccount.status !== "active") {
      return NextResponse.json(
        { success: false, error: "Email account not found or disconnected" },
        { status: 404 }
      );
    }

    // Build recipient arrays
    const toRecipients = (Array.isArray(to) ? to : [to]).map((email: string) => ({
      email: email.trim(),
    }));

    const ccRecipients = cc
      ? (Array.isArray(cc) ? cc : [cc]).map((email: string) => ({ email: email.trim() }))
      : undefined;

    const bccRecipients = bcc
      ? (Array.isArray(bcc) ? bcc : [bcc]).map((email: string) => ({ email: email.trim() }))
      : undefined;

    // Send via Nylas
    const sentMessage = await nylas.messages.send({
      identifier: nylasGrantId,
      requestBody: {
        to: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject,
        body: bodyHtml || bodyPlain || "",
      },
    });

    // Save to Convex
    const emailId = await convex.mutation(api.emails.create, {
      organizationId: organizationId as Id<"organizations">,
      contactId: contactId ? (contactId as Id<"contacts">) : undefined,
      emailAccountId: emailAccountId as Id<"emailAccounts">,
      nylasMessageId: sentMessage.data?.id,
      threadId: sentMessage.data?.threadId,
      direction: "outbound",
      from: emailAccount.email,
      to: Array.isArray(to) ? to : [to],
      cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
      bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
      subject,
      bodyPlain: bodyPlain || undefined,
      bodyHtml: bodyHtml || undefined,
      snippet: (bodyPlain || "").slice(0, 100),
      status: "sent",
      sentAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
      emailId,
      nylasMessageId: sentMessage.data?.id,
    });
  } catch (error) {
    console.error("Email send error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
