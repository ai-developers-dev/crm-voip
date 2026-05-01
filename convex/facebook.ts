/**
 * Facebook Lead Ads — Convex side.
 *
 * Tables (see convex/schema.ts):
 *   - facebookConnections — one row per (org, FB Page) the tenant has
 *     authorized us to receive lead events from. Stores an encrypted
 *     long-lived Page Access Token.
 *   - facebookPendingConnections — short-lived OAuth state during the
 *     multi-page checklist flow. Auto-expires after 10 minutes.
 *   - facebookLeads — every lead Meta tells us about, including
 *     rejections. Dedup by `leadgenId`.
 *
 * Plan reference: ~/.claude/plans/i-think-i-m-confused-declarative-neumann.md
 */

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorizeOrgMember } from "./lib/auth";

// Pending-connection rows live for 10 minutes. After that, a user
// who never finished the multi-page checklist has to start over.
const PENDING_TTL_MS = 10 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────
// Public queries — used by the Settings UI
// ─────────────────────────────────────────────────────────────────────

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
 * Fetch the pending-connections row for the multi-page checklist UI.
 * Returns null if the row doesn't exist (e.g. expired) or doesn't
 * belong to the requested org. Strips the encrypted user token from
 * the returned shape — the client needs the page list, not the token.
 */
export const listPendingByState = query({
  args: {
    organizationId: v.id("organizations"),
    state: v.string(),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    const row = await ctx.db
      .query("facebookPendingConnections")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    if (!row || row.organizationId !== args.organizationId) return null;
    if (row.expiresAt < Date.now()) return null;
    return {
      _id: row._id,
      pages: row.pages,
      expiresAt: row.expiresAt,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────
// Internal queries — used by webhook + cron + actions
// ─────────────────────────────────────────────────────────────────────

export const getConnectionByPageId = internalQuery({
  args: { pageId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("facebookConnections")
      .withIndex("by_page_id", (q) => q.eq("pageId", args.pageId))
      .first();
  },
});

export const listAllActiveConnections = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("facebookConnections")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

export const findLeadByLeadgenId = internalQuery({
  args: { leadgenId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("facebookLeads")
      .withIndex("by_leadgen_id", (q) => q.eq("leadgenId", args.leadgenId))
      .first();
  },
});

export const getPendingByState = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("facebookPendingConnections")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
  },
});

/**
 * Action-time auth helper. Actions can't use `authorizeOrgMember`
 * directly (different runtime, no `ctx.db`); they call this query
 * to verify the Clerk user belongs to the org or is a platform
 * admin. Mirrors `convex/lib/auth.ts:authorizeOrgMember`.
 */
export const isOrgMember = internalQuery({
  args: {
    clerkUserId: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const tenantUsers = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", args.clerkUserId),
      )
      .collect();
    if (tenantUsers.find((u) => u.organizationId === args.organizationId)) {
      return true;
    }
    const platformUser = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", args.clerkUserId),
      )
      .first();
    return Boolean(platformUser?.isActive);
  },
});

// ─────────────────────────────────────────────────────────────────────
// Public mutations
// ─────────────────────────────────────────────────────────────────────

export const disconnect = mutation({
  args: { connectionId: v.id("facebookConnections") },
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

// ─────────────────────────────────────────────────────────────────────
// Internal mutations
// ─────────────────────────────────────────────────────────────────────

/**
 * Insert/update a connection row. Called by `confirmConnections` action
 * after Graph API has yielded a long-lived Page Access Token.
 */
export const upsertConnection = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    pageId: v.string(),
    pageName: v.string(),
    pageAccessTokenEncrypted: v.string(),
    connectedByUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
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

export const storePendingConnection = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    state: v.string(),
    userAccessTokenEncrypted: v.string(),
    pages: v.array(
      v.object({
        pageId: v.string(),
        pageName: v.string(),
      }),
    ),
    initiatedByUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("facebookPendingConnections", {
      organizationId: args.organizationId,
      state: args.state,
      userAccessToken: args.userAccessTokenEncrypted,
      pages: args.pages,
      initiatedByUserId: args.initiatedByUserId,
      createdAt: now,
      expiresAt: now + PENDING_TTL_MS,
    });
  },
});

export const deletePendingConnection = internalMutation({
  args: { id: v.id("facebookPendingConnections") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row) await ctx.db.delete(row._id);
  },
});

/**
 * Create the contact row for a lead and stamp `contactId` on the
 * facebookLeads row. Done in a mutation (not the action) so the
 * insert + the audit-row update happen atomically. Returns the new
 * contactId so the action can fire the workflow trigger.
 */
export const insertContactFromLead = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phoneNumber: v.string(),
    streetAddress: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    company: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("contacts", {
      organizationId: args.organizationId,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      streetAddress: args.streetAddress,
      city: args.city,
      state: args.state,
      zipCode: args.zipCode,
      company: args.company,
      dateOfBirth: args.dateOfBirth,
      notes: args.notes,
      phoneNumbers: [
        {
          number: args.phoneNumber,
          type: "mobile" as const,
          isPrimary: true,
        },
      ],
      isRead: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});


/**
 * Cleanup cron — drop expired pending OAuth rows so the
 * facebookPendingConnections table doesn't accumulate stale state.
 */
export const cleanupExpiredPending = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("facebookPendingConnections")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .take(100);
    for (const row of expired) {
      await ctx.db.delete(row._id);
    }
    return { deleted: expired.length };
  },
});

// ─────────────────────────────────────────────────────────────────────
// Type re-exports
// ─────────────────────────────────────────────────────────────────────
export type FacebookConnectionId = Id<"facebookConnections">;
export type FacebookLeadId = Id<"facebookLeads">;
