import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";

/**
 * Step 1 of the Facebook Lead Ads connect flow.
 *
 * Posted by `<FacebookConnectionsCard>` in tenant Settings. Returns
 * the URL to send the user to so Meta can prompt them to authorize
 * our app + pick which Page(s) they manage.
 *
 * Body shape:
 *   {
 *     organizationId: Id<"organizations">,  // tenant being connected
 *     redirectPath: string,                  // where to land after success
 *   }
 *
 * Response:
 *   { authUrl: string }
 *
 * The `state` param we send to Meta is a random 32-byte token. Meta
 * echoes it back to /api/facebook/callback; we use it as the lookup
 * key for the pending OAuth row in Convex.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const appId = process.env.FACEBOOK_APP_ID;
    if (!appId) {
      return NextResponse.json(
        { error: "FACEBOOK_APP_ID not configured on this deployment" },
        { status: 500 },
      );
    }

    const { organizationId, redirectPath } = (await request.json()) as {
      organizationId?: string;
      redirectPath?: string;
    };
    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing organizationId" },
        { status: 400 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${appUrl}/api/facebook/callback`;

    // Random unguessable state. Doubles as the lookup key for the
    // pending Convex row that gets created in the callback.
    const state = `fb_${crypto.randomBytes(24).toString("base64url")}`;

    // Pack state with the org + return path. Meta echoes `state`
    // verbatim, so the callback can decode this to know which tenant
    // initiated the flow.
    const statePayload = JSON.stringify({
      v: 1,
      state,
      organizationId,
      redirectPath: redirectPath || "/settings",
      initiatedBy: userId,
    });
    const encodedState = Buffer.from(statePayload).toString("base64url");

    // Scopes for Lead Ads (Sprint 1 — polling only):
    //   - pages_show_list       : enumerate user's manageable pages
    //   - pages_read_engagement : read page metadata (name etc.)
    //   - pages_manage_ads      : list Lead Ads forms on a page
    //                             (without this, GET /<page>/leadgen_forms
    //                              returns 403 "Requires pages_manage_ads")
    //   - leads_retrieval       : fetch lead form submissions
    //   - business_management   : Pages owned by a Business need this
    //   - ads_read              : correlate leads with ads/campaigns
    //
    // NOT REQUESTED YET (deferred to Sprint 2):
    //   - pages_manage_metadata : needed to auto-subscribe Pages to
    //     leadgen webhook events. Requires being added to the app's
    //     permissions list in Meta dashboard first.
    const scopes = [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_ads",
      "leads_retrieval",
      "business_management",
      "ads_read",
    ].join(",");

    const dialogUrl = new URL(
      "https://www.facebook.com/v19.0/dialog/oauth",
    );
    dialogUrl.searchParams.set("client_id", appId);
    dialogUrl.searchParams.set("redirect_uri", redirectUri);
    dialogUrl.searchParams.set("state", encodedState);
    dialogUrl.searchParams.set("scope", scopes);
    dialogUrl.searchParams.set("response_type", "code");

    return NextResponse.json({ authUrl: dialogUrl.toString() });
  } catch (err) {
    console.error("[facebook/connect]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
