import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authorizePlatformAdmin } from "./lib/auth";

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agencyTypes").collect();
  },
});

export const getActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("agencyTypes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

export const getById = query({
  args: { id: v.id("agencyTypes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    monthlyBasePrice: v.optional(v.number()),
    perUserPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await authorizePlatformAdmin(ctx);
    const now = Date.now();
    return await ctx.db.insert("agencyTypes", {
      name: args.name,
      description: args.description,
      isActive: true,
      monthlyBasePrice: args.monthlyBasePrice,
      perUserPrice: args.perUserPrice,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("agencyTypes"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    monthlyBasePrice: v.optional(v.number()),
    perUserPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await authorizePlatformAdmin(ctx);
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Agency type not found");

    await ctx.db.patch(id, {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.monthlyBasePrice !== undefined && { monthlyBasePrice: updates.monthlyBasePrice }),
      ...(updates.perUserPrice !== undefined && { perUserPrice: updates.perUserPrice }),
      updatedAt: Date.now(),
    });
  },
});

export const toggleActive = mutation({
  args: { id: v.id("agencyTypes") },
  handler: async (ctx, args) => {
    await authorizePlatformAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Agency type not found");

    await ctx.db.patch(args.id, {
      isActive: !existing.isActive,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("agencyTypes") },
  handler: async (ctx, args) => {
    await authorizePlatformAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Agency type not found");

    // Cascade delete carriers
    const carriers = await ctx.db
      .query("agencyCarriers")
      .withIndex("by_agency_type", (q) => q.eq("agencyTypeId", args.id))
      .collect();
    for (const carrier of carriers) {
      // Delete commissions for this carrier
      const carrierCommissions = await ctx.db
        .query("carrierCommissions")
        .withIndex("by_carrier", (q) => q.eq("carrierId", carrier._id))
        .collect();
      for (const comm of carrierCommissions) {
        await ctx.db.delete(comm._id);
      }
      await ctx.db.delete(carrier._id);
    }

    // Cascade delete products
    const products = await ctx.db
      .query("agencyProducts")
      .withIndex("by_agency_type", (q) => q.eq("agencyTypeId", args.id))
      .collect();
    for (const product of products) {
      // Delete commissions for this product
      const productCommissions = await ctx.db
        .query("carrierCommissions")
        .withIndex("by_product", (q) => q.eq("productId", product._id))
        .collect();
      for (const comm of productCommissions) {
        await ctx.db.delete(comm._id);
      }
      await ctx.db.delete(product._id);
    }

    // Clear agencyTypeId on affected organizations
    const orgs = await ctx.db
      .query("organizations")
      .withIndex("by_agency_type", (q) => q.eq("agencyTypeId", args.id))
      .collect();
    for (const org of orgs) {
      await ctx.db.patch(org._id, { agencyTypeId: undefined, updatedAt: Date.now() });
    }

    await ctx.db.delete(args.id);
  },
});
