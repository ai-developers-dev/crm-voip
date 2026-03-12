import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/** Get all sale types for an organization */
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const types = await ctx.db
      .query("saleTypes")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return types.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Get active sale types for an organization (for dropdowns) */
export const getActive = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const types = await ctx.db
      .query("saleTypes")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return types
      .filter((t) => t.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Create a new sale type */
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("saleTypes")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return await ctx.db.insert("saleTypes", {
      organizationId: args.organizationId,
      name: args.name.trim(),
      isActive: true,
      sortOrder: existing.length,
      createdAt: Date.now(),
    });
  },
});

/** Update a sale type */
export const update = mutation({
  args: {
    id: v.id("saleTypes"),
    name: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    await ctx.db.patch(args.id, patch);
  },
});

/** Delete a sale type */
export const remove = mutation({
  args: { id: v.id("saleTypes") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
