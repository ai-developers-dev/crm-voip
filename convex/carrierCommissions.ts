import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authorizePlatformAdmin } from "./lib/auth";

export const getByAgencyType = query({
  args: { agencyTypeId: v.id("agencyTypes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("carrierCommissions")
      .withIndex("by_agency_type", (q) => q.eq("agencyTypeId", args.agencyTypeId))
      .collect();
  },
});

export const upsert = mutation({
  args: {
    agencyTypeId: v.id("agencyTypes"),
    carrierId: v.id("agencyCarriers"),
    productId: v.id("agencyProducts"),
    commissionRate: v.number(),
    renewalRate: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await authorizePlatformAdmin(ctx);
    // Check if a commission already exists for this carrier+product
    const existing = await ctx.db
      .query("carrierCommissions")
      .withIndex("by_carrier_product", (q) =>
        q.eq("carrierId", args.carrierId).eq("productId", args.productId)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        commissionRate: args.commissionRate,
        renewalRate: args.renewalRate,
        description: args.description,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("carrierCommissions", {
      agencyTypeId: args.agencyTypeId,
      carrierId: args.carrierId,
      productId: args.productId,
      commissionRate: args.commissionRate,
      renewalRate: args.renewalRate,
      description: args.description,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("carrierCommissions") },
  handler: async (ctx, args) => {
    await authorizePlatformAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Commission not found");
    await ctx.db.delete(args.id);
  },
});
