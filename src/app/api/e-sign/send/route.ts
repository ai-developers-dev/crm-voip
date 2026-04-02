import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { convex } from "@/lib/convex/client";
import Nylas from "nylas";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY!,
  apiUri: process.env.NYLAS_API_URI || "https://api.us.nylas.com",
});

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { signatureRequestId, organizationId } = body;

    if (!signatureRequestId || !organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: signatureRequestId, organizationId",
        },
        { status: 400 }
      );
    }

    // Fetch the signature request
    const sigRequest = await convex.query(api.signatureRequests.getById, {
      id: signatureRequestId as Id<"signatureRequests">,
    });

    if (!sigRequest) {
      return NextResponse.json(
        { success: false, error: "Signature request not found" },
        { status: 404 }
      );
    }

    if (sigRequest.status !== "draft") {
      return NextResponse.json(
        { success: false, error: "Can only send draft signature requests" },
        { status: 400 }
      );
    }

    // Get the contact email
    const contact = await convex.query(api.contacts.getById, {
      contactId: sigRequest.contactId,
    });

    if (!contact?.email) {
      return NextResponse.json(
        { success: false, error: "Contact does not have an email address" },
        { status: 400 }
      );
    }

    // Get the sender's user record and email account
    const user = await convex.query(api.users.getByClerkId, {
      clerkUserId,
      organizationId: organizationId as Id<"organizations">,
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Get email accounts for the organization to find a sending account
    const emailAccounts = await convex.query(
      api.emailAccounts.getByOrganization,
      { organizationId: organizationId as Id<"organizations"> }
    );

    const senderAccount = emailAccounts.find(
      (a) => a.userId === user._id && a.status === "active"
    ) || emailAccounts.find((a) => a.status === "active");

    if (!senderAccount?.nylasGrantId) {
      return NextResponse.json(
        {
          success: false,
          error: "No active email account found. Please connect an email account first.",
        },
        { status: 400 }
      );
    }

    // Build signing URL
    const signingUrl = `${APP_URL}/sign/${sigRequest.signingToken}`;

    const subject =
      sigRequest.subject || `Please sign: ${sigRequest.fileName}`;

    const contactFirstName = contact.firstName || "there";
    const senderName = user.name || senderAccount.email;

    const messageText = sigRequest.message
      ? `<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">${sigRequest.message.replace(/\n/g, "<br/>")}</p>`
      : "";

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#7c3aed;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Document Signing Request</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
                Hi ${contactFirstName},
              </p>
              <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
                ${senderName} has sent you a document to review and sign.
              </p>
              ${messageText}
              <!-- Document info -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Document</p>
                    <p style="margin:0;color:#111827;font-size:15px;font-weight:600;">${sigRequest.fileName}</p>
                  </td>
                </tr>
              </table>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${signingUrl}" style="display:inline-block;background-color:#7c3aed;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 32px;border-radius:8px;">
                      Review &amp; Sign Document
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.5;">
                If the button above doesn't work, copy and paste this link into your browser:<br/>
                <a href="${signingUrl}" style="color:#7c3aed;word-break:break-all;">${signingUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e5e7eb;background-color:#f9fafb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                This is an automated signing request. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

    // Send via Nylas
    await nylas.messages.send({
      identifier: senderAccount.nylasGrantId,
      requestBody: {
        to: [{ email: contact.email }],
        subject,
        body: emailHtml,
      },
    });

    // Mark as sent with 30-day expiration
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    await convex.mutation(api.signatureRequests.markSent, {
      id: signatureRequestId as Id<"signatureRequests">,
      expiresAt,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("E-sign send error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
