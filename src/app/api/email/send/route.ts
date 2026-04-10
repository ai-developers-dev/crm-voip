import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { convex } from "@/lib/convex/client";
import Nylas from "nylas";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { generateUnsubscribeUrl } from "@/lib/email/unsubscribe";

const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY!,
  apiUri: process.env.NYLAS_API_URI || "https://api.us.nylas.com",
});


export async function POST(request: NextRequest) {
  try {
    const { userId, orgId: clerkOrgId } = await auth();
    if (!userId || !clerkOrgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // Cross-tenant guard: Clerk org must match request organizationId
    const callerOrg = await convex.query(api.organizations.getCurrent, { clerkOrgId });
    if (!callerOrg || callerOrg._id !== organizationId) {
      return NextResponse.json(
        { success: false, error: "Forbidden: organization mismatch" },
        { status: 403 }
      );
    }

    // Get the email account to use as "from"
    const emailAccount = await convex.query(api.emailAccounts.getByNylasGrant, {
      nylasGrantId,
    });

    if (!emailAccount || emailAccount.status !== "active" || emailAccount.organizationId !== organizationId) {
      return NextResponse.json(
        { success: false, error: "Email account not found or disconnected" },
        { status: 404 }
      );
    }

    // Pre-send opt-out check
    if (contactId) {
      const contact = await convex.query(api.contacts.getById, {
        contactId: contactId as Id<"contacts">,
      });
      if (contact?.emailOptedOut) {
        return NextResponse.json(
          { success: false, error: "Contact has unsubscribed from email." },
          { status: 400 }
        );
      }
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

    // Append unsubscribe footer if sending to a known contact
    let finalBodyHtml = bodyHtml || bodyPlain || "";
    if (contactId && organizationId) {
      const unsubUrl = generateUnsubscribeUrl(contactId, organizationId);
      finalBodyHtml += `<p style="font-size:11px;color:#999;margin-top:20px;border-top:1px solid #eee;padding-top:10px;">If you no longer wish to receive emails, <a href="${unsubUrl}" style="color:#999;">unsubscribe here</a>.</p>`;
    }

    // Send via Nylas
    const sentMessage = await nylas.messages.send({
      identifier: nylasGrantId,
      requestBody: {
        to: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject,
        body: finalBodyHtml,
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
