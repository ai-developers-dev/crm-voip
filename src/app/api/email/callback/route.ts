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


export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Try to extract redirectPath from state for error redirects
  let fallbackRedirect = "/settings";
  if (state) {
    try { fallbackRedirect = JSON.parse(state).redirectPath || "/settings"; } catch {}
  }

  if (error) {
    console.error("Nylas OAuth error:", error);
    return NextResponse.redirect(
      `${appUrl}${fallbackRedirect}?email_error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}${fallbackRedirect}?email_error=missing_code`
    );
  }

  try {
    const { organizationId, userId, redirectPath } = JSON.parse(state);

    // Exchange code for grant
    const callbackUrl = `${appUrl}/api/email/callback`;
    const response = await nylas.auth.exchangeCodeForToken({
      clientId: process.env.NYLAS_CLIENT_ID!,
      redirectUri: callbackUrl,
      code,
    });

    const grantId = response.grantId;
    const email = response.email;

    // Determine provider from email domain
    let provider = "imap";
    if (email) {
      const domain = email.split("@")[1]?.toLowerCase();
      if (domain === "gmail.com" || domain?.endsWith(".google.com") || domain?.includes("googlemail")) {
        provider = "gmail";
      } else if (domain === "outlook.com" || domain === "hotmail.com" || domain?.endsWith(".onmicrosoft.com") || domain === "live.com") {
        provider = "outlook";
      }
    }

    // Save to Convex
    const emailAccountId = await convex.mutation(api.emailAccounts.create, {
      organizationId: organizationId as Id<"organizations">,
      userId: userId ? (userId as Id<"users">) : undefined,
      email: email || "unknown",
      provider,
      nylasGrantId: grantId,
    });

    // Trigger initial calendar sync in the background (non-blocking)
    fetch(`${appUrl}/api/email/calendar-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailAccountId,
        grantId,
        organizationId,
      }),
    }).catch((err) => console.error("Calendar backfill trigger failed:", err));

    const successRedirect = redirectPath || "/settings";
    return NextResponse.redirect(
      `${appUrl}${successRedirect}?email_connected=true`
    );
  } catch (err) {
    console.error("Nylas callback error:", err);
    const errorRedirect = fallbackRedirect;
    return NextResponse.redirect(
      `${appUrl}${errorRedirect}?email_error=${encodeURIComponent((err as Error).message)}`
    );
  }
}
