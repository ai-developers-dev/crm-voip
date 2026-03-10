import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get all email accounts for an organization
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailAccounts")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
  },
});

// Get email accounts for a specific user
export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

// Get email account by Nylas grant ID
export const getByNylasGrant = query({
  args: { nylasGrantId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailAccounts")
      .withIndex("by_nylas_grant", (q) =>
        q.eq("nylasGrantId", args.nylasGrantId)
      )
      .first();
  },
});

// Get email account by email address within an org
export const getByEmail = query({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailAccounts")
      .withIndex("by_email", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.email)
      )
      .first();
  },
});

// Create a new email account (after Nylas OAuth)
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.optional(v.id("users")),
    email: v.string(),
    provider: v.string(),
    nylasGrantId: v.string(),
    nylasAccountId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("emailAccounts", {
      organizationId: args.organizationId,
      userId: args.userId,
      email: args.email,
      provider: args.provider,
      nylasGrantId: args.nylasGrantId,
      nylasAccountId: args.nylasAccountId,
      status: "active",
      syncState: "syncing",
      connectedAt: Date.now(),
    });
  },
});

// Update email account status
export const updateStatus = mutation({
  args: {
    emailAccountId: v.id("emailAccounts"),
    status: v.string(),
    syncState: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = { status: args.status };
    if (args.syncState !== undefined) updates.syncState = args.syncState;
    if (args.lastSyncAt !== undefined) updates.lastSyncAt = args.lastSyncAt;
    await ctx.db.patch(args.emailAccountId, updates);
  },
});

// Disconnect (soft delete) an email account
export const disconnect = mutation({
  args: { emailAccountId: v.id("emailAccounts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.emailAccountId, {
      status: "disconnected",
      syncState: undefined,
    });
  },
});

// Hard delete an email account
export const remove = mutation({
  args: { emailAccountId: v.id("emailAccounts") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.emailAccountId);
  },
});
