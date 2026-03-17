import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authorizePlatformAdmin } from "./lib/auth";

export const getByAgencyType = query({
  args: { agencyTypeId: v.id("agencyTypes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agencyCarriers")
      .withIndex("by_agency_type", (q) => q.eq("agencyTypeId", args.agencyTypeId))
      .collect();
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agencyCarriers").collect();
  },
});

export const create = mutation({
  args: {
    agencyTypeId: v.id("agencyTypes"),
    name: v.string(),
    websiteUrl: v.optional(v.string()),
    portalUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await authorizePlatformAdmin(ctx);
    const now = Date.now();
    return await ctx.db.insert("agencyCarriers", {
      agencyTypeId: args.agencyTypeId,
      name: args.name,
      ...(args.websiteUrl && { websiteUrl: args.websiteUrl }),
      ...(args.portalUrl && { portalUrl: args.portalUrl }),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("agencyCarriers"),
    name: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    portalUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await authorizePlatformAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Carrier not found");

    await ctx.db.patch(args.id, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.websiteUrl !== undefined && { websiteUrl: args.websiteUrl || undefined }),
      ...(args.portalUrl !== undefined && { portalUrl: args.portalUrl || undefined }),
      updatedAt: Date.now(),
    });
  },
});

export const toggleActive = mutation({
  args: { id: v.id("agencyCarriers") },
  handler: async (ctx, args) => {
    await authorizePlatformAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Carrier not found");

    await ctx.db.patch(args.id, {
      isActive: !existing.isActive,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("agencyCarriers") },
  handler: async (ctx, args) => {
    await authorizePlatformAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Carrier not found");

    // Cascade delete related products (lines of business)
    const products = await ctx.db
      .query("agencyProducts")
      .withIndex("by_carrier", (q) => q.eq("carrierId", args.id))
      .collect();
    for (const product of products) {
      // Delete commissions for this product
      const comms = await ctx.db
        .query("carrierCommissions")
        .withIndex("by_product", (q) => q.eq("productId", product._id))
        .collect();
      for (const comm of comms) {
        await ctx.db.delete(comm._id);
      }
      await ctx.db.delete(product._id);
    }

    // Delete direct commissions for this carrier
    const commissions = await ctx.db
      .query("carrierCommissions")
      .withIndex("by_carrier", (q) => q.eq("carrierId", args.id))
      .collect();
    for (const comm of commissions) {
      await ctx.db.delete(comm._id);
    }

    await ctx.db.delete(args.id);
  },
});
