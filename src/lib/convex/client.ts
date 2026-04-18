import { ConvexHttpClient } from "convex/browser";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is not set. Add it to your .env.local file."
  );
}

export const convex = new ConvexHttpClient(convexUrl);

// Returns a fresh ConvexHttpClient per request. Never call setAuth on the
// shared `convex` singleton above — the JWT state leaks across unrelated
// requests and, once expired, makes every subsequent call fail with
// "Could not verify OIDC token claim". Use this helper in server routes
// that forward a Clerk JWT to Convex (mutations/queries that call
// ctx.auth.getUserIdentity).
export function getConvexHttpClient(authToken?: string | null): ConvexHttpClient {
  const client = new ConvexHttpClient(convexUrl!);
  if (authToken) client.setAuth(authToken);
  return client;
}
