import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import {
  authorizeOrgMember,
  authorizeOrgAdmin,
  authorizeSuperAdmin,
} from "./lib/auth";

/**
 * Platform-defined call dispositions + per-tenant opt-in.
 *
 * The UX: super admin creates/edits/disables dispositions at
 * /admin/settings. Every tenant opts in/out of each active disposition at
 * /settings. Agents see the intersection (platform-active AND tenant-enabled)
 * in the hang-up modal.
 */

/* ──────────── Super-admin CRUD (platform master list) ──────────── */

export const listPlatform = query({
  args: {},
  handler: async (ctx) => {
    await authorizeSuperAdmin(ctx);
    return await ctx.db
      .query("callDispositions")
      .collect()
      .then((rows) =>
        rows.sort((a, b) => a.sortOrder - b.sortOrder),
      );
  },
});

export const platformCreate = mutation({
  args: {
    label: v.string(),
    category: v.optional(
      v.union(
        v.literal("contacted"),
        v.literal("not_contacted"),
        v.literal("outcome"),
      ),
    ),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await authorizeSuperAdmin(ctx);
    const existing = await ctx.db.query("callDispositions").collect();
    const nextOrder = args.sortOrder ?? (existing.length + 1) * 10;
    return await ctx.db.insert("callDispositions", {
      label: args.label,
      category: args.category,
      sortOrder: nextOrder,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

export const platformUpdate = mutation({
  args: {
    id: v.id("callDispositions"),
    label: v.optional(v.string()),
    category: v.optional(
      v.union(
        v.literal("contacted"),
        v.literal("not_contacted"),
        v.literal("outcome"),
      ),
    ),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await authorizeSuperAdmin(ctx);
    const { id, ...patch } = args;
    const cleaned = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(id, cleaned);
  },
});

export const platformRemove = mutation({
  args: { id: v.id("callDispositions") },
  handler: async (ctx, args) => {
    await authorizeSuperAdmin(ctx);
    // Soft delete pattern: set isActive=false rather than deleting, since
    // historical callHistory rows reference this id. Hard delete only if
    // nothing references it.
    const refs = await ctx.db
      .query("callHistory")
      .withIndex("by_org_needs_disposition")
      .filter((q) => q.eq(q.field("dispositionId"), args.id))
      .first();
    if (refs) {
      await ctx.db.patch(args.id, { isActive: false });
      return { softDeleted: true };
    }
    await ctx.db.delete(args.id);
    return { softDeleted: false };
  },
});

/* ──────────── Tenant opt-in ──────────── */

export const listTenant = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    const platform = await ctx.db
      .query("callDispositions")
      .withIndex("by_active_sort", (q) => q.eq("isActive", true))
      .collect();
    const overrides = await ctx.db
      .query("tenantCallDispositions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();
    const overrideMap = new Map(overrides.map((o) => [o.dispositionId, o.enabled]));
    return platform
      .map((d) => ({
        _id: d._id,
        label: d.label,
        category: d.category,
        sortOrder: d.sortOrder,
        // Default to true when no explicit override — new tenants see every
        // platform-active disposition.
        enabled: overrideMap.get(d._id) ?? true,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/**
 * The live list used by the hang-up modal. Intersect platform-active AND
 * tenant-enabled (default enabled).
 */
export const listEnabledForOrg = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    const platform = await ctx.db
      .query("callDispositions")
      .withIndex("by_active_sort", (q) => q.eq("isActive", true))
      .collect();
    const overrides = await ctx.db
      .query("tenantCallDispositions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();
    const disabled = new Set(
      overrides.filter((o) => !o.enabled).map((o) => o.dispositionId),
    );
    return platform
      .filter((d) => !disabled.has(d._id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((d) => ({
        _id: d._id,
        label: d.label,
        category: d.category,
        sortOrder: d.sortOrder,
      }));
  },
});

export const tenantSetEnabled = mutation({
  args: {
    organizationId: v.id("organizations"),
    dispositionId: v.id("callDispositions"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await authorizeOrgAdmin(ctx, args.organizationId);
    const existing = await ctx.db
      .query("tenantCallDispositions")
      .withIndex("by_org_disposition", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("dispositionId", args.dispositionId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { enabled: args.enabled });
    } else {
      await ctx.db.insert("tenantCallDispositions", {
        organizationId: args.organizationId,
        dispositionId: args.dispositionId,
        enabled: args.enabled,
        createdAt: Date.now(),
      });
    }
  },
});

/* ──────────── Saving a disposition against a call ──────────── */

export const saveForCall = mutation({
  args: {
    callHistoryId: v.id("callHistory"),
    dispositionId: v.id("callDispositions"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callHistoryId);
    if (!call) throw new Error("Call not found");
    await authorizeOrgMember(ctx, call.organizationId);
    const disp = await ctx.db.get(args.dispositionId);
    if (!disp) throw new Error("Disposition not found");
    await ctx.db.patch(args.callHistoryId, {
      dispositionId: args.dispositionId,
      disposition: disp.label,
      notes: args.notes ?? call.notes,
    });
  },
});

/**
 * A banner on /dashboard uses this to nudge agents to backfill dispositions
 * they dismissed or missed. Returns the most-recent call in the org that
 * this agent handled that still has no disposition.
 */
export const getOldestCallMissingDispositionForUser = query({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    const rows = await ctx.db
      .query("callHistory")
      .withIndex("by_user_date", (q) => q.eq("handledByUserId", args.userId))
      .order("desc")
      .take(30);
    // We want the oldest-in-the-last-30 without a disposition, so agents
    // clear them FIFO. Filter to this org and no dispositionId.
    const missing = rows
      .filter(
        (r) =>
          r.organizationId === args.organizationId &&
          !r.dispositionId &&
          r.outcome === "answered",
      )
      .sort((a, b) => a.startedAt - b.startedAt);
    return missing[0] ?? null;
  },
});

/* ──────────── Seed ──────────── */

export const seedDefaultsIfEmpty = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("callDispositions").first();
    if (existing) return { seeded: 0 };
    const defaults: Array<{
      label: string;
      category: "contacted" | "not_contacted" | "outcome";
    }> = [
      { label: "No Answer", category: "not_contacted" },
      { label: "Left Voicemail", category: "not_contacted" },
      { label: "Wrong Number", category: "not_contacted" },
      { label: "Busy", category: "not_contacted" },
      { label: "Spoke - Callback Requested", category: "contacted" },
      { label: "Spoke - Not Interested", category: "contacted" },
      { label: "Spoke - Interested", category: "contacted" },
      { label: "Do Not Call", category: "outcome" },
      { label: "Quote Sent", category: "outcome" },
      { label: "Sold", category: "outcome" },
    ];
    let order = 10;
    for (const d of defaults) {
      await ctx.db.insert("callDispositions", {
        label: d.label,
        category: d.category,
        sortOrder: order,
        isActive: true,
        createdAt: Date.now(),
      });
      order += 10;
    }
    return { seeded: defaults.length };
  },
});
