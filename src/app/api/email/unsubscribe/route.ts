import { NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";


// Simple token: base64(contactId:orgId)
function verifyToken(token: string): { contactId: string; orgId: string } | null {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [contactId, orgId] = decoded.split(":");
    if (contactId && orgId) return { contactId, orgId };
    return null;
  } catch { return null; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return new NextResponse("<html><body><h1>Invalid unsubscribe link</h1></body></html>", {
      headers: { "Content-Type": "text/html" },
    });
  }

  const verified = verifyToken(token);
  if (!verified) {
    return new NextResponse("<html><body><h1>Invalid unsubscribe link</h1></body></html>", {
      headers: { "Content-Type": "text/html" },
    });
  }

  try {
    await convex.mutation(api.contacts.setEmailOptedOut, {
      contactId: verified.contactId as Id<"contacts">,
      optedOut: true,
    });

    // Log consent event
    await convex.mutation(api.smsConsent.log, {
      organizationId: verified.orgId as Id<"organizations">,
      contactId: verified.contactId as Id<"contacts">,
      phoneNumber: "",
      action: "email_opt_out",
      source: "unsubscribe_link",
    });

    return new NextResponse(`
      <html>
        <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #fafafa;">
          <div style="text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h1 style="font-size: 24px; margin-bottom: 8px;">Unsubscribed</h1>
            <p style="color: #666;">You have been successfully unsubscribed from our emails.</p>
          </div>
        </body>
      </html>
    `, { headers: { "Content-Type": "text/html" } });
  } catch {
    return new NextResponse("<html><body><h1>Something went wrong. Please try again.</h1></body></html>", {
      headers: { "Content-Type": "text/html" },
    });
  }
}
