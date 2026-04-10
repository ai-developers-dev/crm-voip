import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/sign/(.*)",              // E-signature public signing pages
  "/api/twilio/(.*)",        // Twilio webhooks (signature validated)
  "/api/e-sign/(.*)",        // E-sign API (has its own auth check)
  "/api/health",             // Health check for monitoring/uptime
  "/api/retell/webhook",     // Retell webhook (HMAC signature validated)
  "/api/email/webhook",      // Nylas webhook (HMAC signature validated)
  "/api/email/calendar-webhook", // Nylas calendar webhook (HMAC signature validated)
  "/api/stripe/webhook",     // Stripe webhook (signature validated)
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
