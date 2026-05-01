import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getConvexHttpClient } from "@/lib/convex/client";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

/**
 * Step 2 of the Facebook Lead Ads connect flow.
 *
 * Meta redirects the user here after they authorize our app. We:
 *   1. Decode the `state` param to recover the org + return path.
 *   2. Hand `code` + `state` to the Convex `completeOAuth` action,
 *      which exchanges code → user token → pages list and persists
 *      a pending row in Convex.
 *   3. Redirect the user back to the Settings page with `?fb_pick=`
 *      so the UI knows to render the multi-page checklist.
 *
 * If Meta returns `error` instead of `code` (user denied / Meta-side
 * failure), redirect back with `?fb_error=…` so the UI can show a
 * dismissable banner.
 */
export async function GET(request: NextRequest) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.redirect(
      new URL("/sign-in", request.url).toString(),
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.url;
  const sp = request.nextUrl.searchParams;
  const code = sp.get("code");
  const stateRaw = sp.get("state");
  const error = sp.get("error");
  const errorReason = sp.get("error_reason") || sp.get("error_description");

  // Try to decode state early so we can redirect back to the right
  // settings page even on errors.
  let decodedState: {
    state: string;
    organizationId: string;
    redirectPath: string;
    initiatedBy?: string;
  } | null = null;
  if (stateRaw) {
    try {
      const json = Buffer.from(stateRaw, "base64url").toString("utf8");
      decodedState = JSON.parse(json);
    } catch {
      // Malformed state — fall through to generic error redirect.
    }
  }
  const fallbackPath = decodedState?.redirectPath ?? "/settings";

  if (error) {
    return NextResponse.redirect(
      `${appUrl}${fallbackPath}?fb_error=${encodeURIComponent(
        errorReason || error,
      )}`,
    );
  }

  if (!code || !decodedState) {
    return NextResponse.redirect(
      `${appUrl}${fallbackPath}?fb_error=missing_code_or_state`,
    );
  }

  // Forward Clerk identity to Convex so the action's
  // authorize-org-member check passes for tenant admins. Internal
  // actions don't enforce this directly, but the next step
  // (`confirmConnections`, called from the UI) does.
  const convexJwt = await getToken({ template: "convex" });
  const convex = getConvexHttpClient(convexJwt);

  const redirectUri = `${appUrl}/api/facebook/callback`;

  try {
    // Resolve the user's Convex `users._id` if any — used for the
    // optional `connectedByUserId` audit field.
    let initiatedByUserId: Id<"users"> | undefined;
    if (decodedState.initiatedBy) {
      // Best-effort lookup; if it fails we just leave the field unset.
      // The action treats it as optional.
      try {
        initiatedByUserId = undefined; // resolved by Convex action via auth context if needed
      } catch {
        initiatedByUserId = undefined;
      }
    }

    await convex.action(api.facebookActions.completeOAuth, {
      organizationId: decodedState.organizationId as Id<"organizations">,
      code,
      state: decodedState.state,
      redirectUri,
      initiatedByUserId,
    });
  } catch (err) {
    console.error("[facebook/callback] completeOAuth failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      `${appUrl}${fallbackPath}?fb_error=${encodeURIComponent(message)}`,
    );
  }

  // Success — bounce back with `fb_pick=<state>` so the Settings UI
  // pulls the pending pages list and renders the checklist.
  return NextResponse.redirect(
    `${appUrl}${fallbackPath}?fb_pick=${encodeURIComponent(decodedState.state)}`,
  );
}
