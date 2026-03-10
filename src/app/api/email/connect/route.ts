import { NextRequest, NextResponse } from "next/server";
import Nylas from "nylas";

const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY!,
  apiUri: process.env.NYLAS_API_URI || "https://api.us.nylas.com",
});

export async function POST(request: NextRequest) {
  try {
    const { organizationId, userId, redirectUri, provider } = await request.json();

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "Missing organizationId" },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const callbackUrl = redirectUri || `${appUrl}/api/email/callback`;

    // Validate provider if specified (skip Nylas chooser page for white-labeling)
    const validProviders = ["google", "microsoft", "imap"] as const;
    const selectedProvider = provider && validProviders.includes(provider) ? provider : undefined;

    // Generate Nylas hosted auth URL
    // When provider is specified, users go straight to Google/Microsoft OAuth
    // bypassing the Nylas-branded provider selection screen
    const authUrl = nylas.auth.urlForOAuth2({
      clientId: process.env.NYLAS_CLIENT_ID!,
      redirectUri: callbackUrl,
      state: JSON.stringify({ organizationId, userId }),
      provider: selectedProvider,
    });

    return NextResponse.json({ success: true, authUrl });
  } catch (error) {
    console.error("Email connect error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
