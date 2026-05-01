/**
 * Facebook Lead Ads — Convex side.
 *
 * Tables (see convex/schema.ts):
 *   - facebookConnections — one row per (org, FB Page) the tenant has
 *     authorized us to receive lead events from. Stores an encrypted
 *     long-lived Page Access Token.
 *   - facebookLeads — every lead Meta tells us about, including
 *     rejections. Dedup by `leadgenId`.
 *
 * This module is the data layer. The OAuth dance + Graph API I/O lives
 * in Next.js API routes (src/app/api/facebook/*) which do the HTTP
 * work and then call into these mutations/actions to persist.
 *
 * Plan reference: ~/.claude/plans/i-think-i-m-confused-declarative-neumann.md
 */

import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { authorizeOrgMember } from "./lib/auth";

// ─────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────

/**
 * List every Facebook connection for an org. Drives the Settings UI.
 * Strips the encrypted token from the result — clients should never
 * see it.
 */
export const listForOrg = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    const rows = await ctx.db
      .query("facebookConnections")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      pageId: r.pageId,
      pageName: r.pageName,
      status: r.status,
      connectedByUserId: r.connectedByUserId,
      connectedAt: r.connectedAt,
      lastSyncAt: r.lastSyncAt,
      formIds: r.formIds,
      errorMessage: r.errorMessage,
      // pageAccessToken intentionally omitted
    }));
  },
});

/**
 * Recent lead events for an org — both successes and rejections.
 * Powers the "Recent leads" panel in the Settings UI so tenants can
 * see "no_phone" rejections and fix their forms.
 */
export const recentLeadsForOrg = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    const rows = await ctx.db
      .query("facebookLeads")
      .withIndex("by_org_received_at", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .order("desc")
      .take(args.limit ?? 50);
    return rows.map((r) => ({
      _id: r._id,
      leadgenId: r.leadgenId,
      pageId: r.pageId,
      formId: r.formId,
      adId: r.adId,
      campaignId: r.campaignId,
      contactId: r.contactId,
      errorMessage: r.errorMessage,
      receivedAt: r.receivedAt,
    }));
  },
});

/**
 * Internal lookup: given a Meta Page ID from a webhook payload,
 * find which org owns it. Used by /api/facebook/webhook to route
 * the event to the right tenant.
 */
export const getConnectionByPageId = internalQuery({
  args: { pageId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("facebookConnections")
      .withIndex("by_page_id", (q) => q.eq("pageId", args.pageId))
      .first();
  },
});

/**
 * Internal lookup: every active connection in the system.
 * Used by the cron (`pollLeads`) to walk all tenants once per
 * interval and ask Meta for new leads.
 */
export const listAllActiveConnections = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("facebookConnections")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

/**
 * Internal lookup: dedup check — has this leadgenId been seen?
 * Used before calling contacts.create to avoid double-creating
 * contacts when both the webhook and the poller deliver the same
 * lead.
 */
export const findLeadByLeadgenId = internalQuery({
  args: { leadgenId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("facebookLeads")
      .withIndex("by_leadgen_id", (q) => q.eq("leadgenId", args.leadgenId))
      .first();
  },
});

// ─────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────

/**
 * Insert or update a connection row. Called by /api/facebook/callback
 * after the OAuth dance has produced a (page-id, page-name,
 * encrypted-token) triple. If a row already exists for this
 * (org, pageId) pair we update it in place — covers the
 * "reconnect after token expired" case without orphan rows.
 */
export const upsertConnection = mutation({
  args: {
    organizationId: v.id("organizations"),
    pageId: v.string(),
    pageName: v.string(),
    pageAccessTokenEncrypted: v.string(),
    connectedByUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    const existing = await ctx.db
      .query("facebookConnections")
      .withIndex("by_page_id", (q) => q.eq("pageId", args.pageId))
      .first();

    const now = Date.now();
    if (existing && existing.organizationId === args.organizationId) {
      await ctx.db.patch(existing._id, {
        pageName: args.pageName,
        pageAccessToken: args.pageAccessTokenEncrypted,
        status: "active",
        connectedByUserId: args.connectedByUserId,
        connectedAt: now,
        errorMessage: undefined,
      });
      return { _id: existing._id, created: false };
    }
    if (existing && existing.organizationId !== args.organizationId) {
      // Same Meta page already connected to a different tenant.
      // Refuse to silently steal it; surface a clear error to the UI.
      throw new Error(
        "This Facebook Page is already connected to a different tenant. Disconnect it there first.",
      );
    }

    const id = await ctx.db.insert("facebookConnections", {
      organizationId: args.organizationId,
      pageId: args.pageId,
      pageName: args.pageName,
      pageAccessToken: args.pageAccessTokenEncrypted,
      status: "active",
      connectedByUserId: args.connectedByUserId,
      connectedAt: now,
    });
    return { _id: id, created: true };
  },
});

/**
 * Disconnect button. Marks the row "disconnected" rather than
 * deleting so admins can see history. The webhook / cron skip
 * inactive rows.
 */
export const disconnect = mutation({
  args: {
    connectionId: v.id("facebookConnections"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.connectionId);
    if (!row) return { success: true, alreadyGone: true };
    await authorizeOrgMember(ctx, row.organizationId);
    await ctx.db.patch(args.connectionId, {
      status: "disconnected",
      errorMessage: undefined,
    });
    return { success: true, alreadyGone: false };
  },
});

/**
 * Internal mutation: stamp lastSyncAt + errorMessage. Called by the
 * polling cron and the lead-ingest action to keep the connection
 * row's bookkeeping current.
 */
export const updateConnectionStatus = internalMutation({
  args: {
    connectionId: v.id("facebookConnections"),
    lastSyncAt: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("disconnected"),
        v.literal("error"),
      ),
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.lastSyncAt !== undefined) patch.lastSyncAt = args.lastSyncAt;
    if (args.status !== undefined) patch.status = args.status;
    if (args.errorMessage !== undefined) patch.errorMessage = args.errorMessage;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(args.connectionId, patch);
  },
});

/**
 * Internal mutation: write the audit row. Called by ingestLead
 * regardless of whether the contact was created — the row's
 * `errorMessage` field captures rejections.
 */
export const recordLead = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    leadgenId: v.string(),
    pageId: v.string(),
    formId: v.string(),
    adId: v.optional(v.string()),
    campaignId: v.optional(v.string()),
    rawFieldData: v.any(),
    contactId: v.optional(v.id("contacts")),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("facebookLeads", {
      organizationId: args.organizationId,
      leadgenId: args.leadgenId,
      pageId: args.pageId,
      formId: args.formId,
      adId: args.adId,
      campaignId: args.campaignId,
      rawFieldData: args.rawFieldData,
      contactId: args.contactId,
      errorMessage: args.errorMessage,
      receivedAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────
// Actions — outbound HTTP to Meta Graph API
// ─────────────────────────────────────────────────────────────────────
//
// These STUBS define the right shape; bodies will be filled in when
// the Meta App credentials land. Today they throw a clear "not yet
// configured" error so the rest of the system can be wired against
// them safely. Schema + Convex side compiles + deploys today;
// Sprint 1 (after creds) replaces the throws with real Graph fetches.

/**
 * Ingest a single lead by its leadgen ID. Called by:
 *   1. /api/facebook/webhook on real-time delivery (preferred path)
 *   2. /api/facebook/cron-poll for catch-up
 * Both paths converge here so contact creation logic stays in one
 * place.
 *
 * Flow (when implemented):
 *   1. Look up the connection by pageId.
 *   2. Decrypt page access token via lib/credentials/crypto.ts.
 *   3. GET https://graph.facebook.com/v19.0/{leadgenId}?fields=field_data,form_id,ad_id,campaign_id,created_time
 *      with access_token=<decrypted>.
 *   4. Map field_data → contact fields per docs/plan.
 *   5. If no phone field present → recordLead with errorMessage:"no_phone", DON'T create contact.
 *   6. Otherwise → contacts.create (or upsert by phone/email match), then recordLead with contactId.
 *   7. Schedule workflowEngine.checkTriggers({ triggerType: "contact_created" }).
 */
export const ingestLead = internalAction({
  args: {
    organizationId: v.id("organizations"),
    pageId: v.string(),
    leadgenId: v.string(),
  },
  handler: async (_ctx, _args) => {
    // SCAFFOLD: real implementation lands in Sprint 1.
    // Throwing rather than no-op so any premature wiring blows up
    // loudly during dev instead of silently dropping leads.
    throw new Error(
      "facebook.ingestLead not yet implemented — waiting on FACEBOOK_APP_ID/SECRET",
    );
  },
});

/**
 * Polling fallback. Cron calls this every 5 minutes:
 *   1. listAllActiveConnections.
 *   2. For each: GET /{pageId}/leads?fields=...&since=<lastSyncAt>
 *      using the decrypted access token.
 *   3. For each new lead → ingestLead.
 *   4. updateConnectionStatus(lastSyncAt: now).
 *
 * Webhook is the primary delivery; this catches drops.
 */
export const pollLeads = internalAction({
  args: {},
  handler: async (_ctx) => {
    // SCAFFOLD: real implementation lands in Sprint 1.
    // Returning quietly here so the cron entry can be enabled in
    // convex/crons.ts even before creds — it'll just no-op until
    // we replace this body. Better than crashing the cron loop.
    return { skipped: "not_yet_configured" };
  },
});

// ─────────────────────────────────────────────────────────────────────
// Type re-exports for callers
// ─────────────────────────────────────────────────────────────────────
//
// Keeps consumers from having to dig through Doc<"facebookConnections">
// shapes. Add as needed.
export type FacebookConnectionId = Id<"facebookConnections">;
export type FacebookLeadId = Id<"facebookLeads">;

// Keep `internal` and `action` referenced even though stubs don't
// use them, so the imports don't get stripped by tree-shake when
// the real bodies land.
void internal;
void action;
