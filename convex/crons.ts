import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Scheduled background jobs. Convex picks this file up automatically
 * on deploy; no other registration is needed.
 */
const crons = cronJobs();

/**
 * Sweep zombie activeCalls rows every 30 minutes.
 *
 * Calls in "ringing" or "connecting" state should resolve in seconds
 * (Twilio Dial timeout is 30s, our default ringTimeout is 30s). If a
 * row sits in those states for > 60 minutes it's an orphan — left
 * behind by a webhook that didn't fire, a network blip, or a code
 * path that bailed before tearing the row down. We've fixed many
 * such bugs in the last few weeks, but defensive cleanup keeps the
 * activeCalls table from accumulating zombies again.
 *
 * Verified manually 2026-04-29 — found 4 stale rows from 2026-04-16
 * that had been polluting dual-SID lookups for two weeks. This cron
 * makes that the LAST time anyone has to notice.
 */
crons.interval(
  "sweep stale ringing activeCalls",
  { minutes: 30 },
  internal.inspectCallLog.cleanStaleRinging,
  { olderThanMinutes: 60 },
);

/**
 * Poll Facebook Lead Ads as a catch-up for missed webhook deliveries.
 *
 * Webhook (`/api/facebook/webhook`) is the primary delivery path —
 * real-time, low-latency. This cron is the safety net: every 5 minutes
 * it walks every active facebookConnections row, asks Meta for any
 * leads since the row's `lastSyncAt`, and ingests them through the
 * same code path the webhook uses.
 *
 * Currently the action body is a scaffold (returns { skipped:
 * "not_yet_configured" }) until the Meta App credentials are set on
 * Railway. The cron is wired up so the moment FACEBOOK_APP_ID +
 * FACEBOOK_APP_SECRET are present, real polling kicks in without a
 * separate deploy.
 */
crons.interval(
  "poll Facebook Lead Ads",
  { minutes: 5 },
  internal.facebook.pollLeads,
);

export default crons;
