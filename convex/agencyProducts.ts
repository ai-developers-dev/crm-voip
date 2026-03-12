import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const coverageFieldValidator = v.object({
  key: v.string(),
  label: v.string(),
  placeholder: v.optional(v.string()),
  type: v.optional(v.union(
    v.literal("text"),
    v.literal("currency"),
    v.literal("number"),
    v.literal("select"),
  )),
  options: v.optional(v.array(v.string())),
  apiFieldName: v.optional(v.string()),
});

export const getByAgencyType = query({
  args: { agencyTypeId: v.id("agencyTypes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agencyProducts")
      .withIndex("by_agency_type", (q) => q.eq("agencyTypeId", args.agencyTypeId))
      .collect();
  },
});

export const getByCarrier = query({
  args: { carrierId: v.id("agencyCarriers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agencyProducts")
      .withIndex("by_carrier", (q) => q.eq("carrierId", args.carrierId))
      .collect();
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agencyProducts").collect();
  },
});

export const create = mutation({
  args: {
    agencyTypeId: v.id("agencyTypes"),
    carrierId: v.id("agencyCarriers"),
    name: v.string(),
    coverageFields: v.optional(v.array(coverageFieldValidator)),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("agencyProducts", {
      agencyTypeId: args.agencyTypeId,
      carrierId: args.carrierId,
      name: args.name,
      isActive: true,
      ...(args.coverageFields && { coverageFields: args.coverageFields }),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("agencyProducts"),
    name: v.optional(v.string()),
    coverageFields: v.optional(v.array(coverageFieldValidator)),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Product not found");

    await ctx.db.patch(args.id, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.coverageFields !== undefined && { coverageFields: args.coverageFields }),
      updatedAt: Date.now(),
    });
  },
});

export const getByIds = query({
  args: { ids: v.array(v.id("agencyProducts")) },
  handler: async (ctx, args) => {
    return await Promise.all(args.ids.map((id) => ctx.db.get(id)));
  },
});

export const toggleActive = mutation({
  args: { id: v.id("agencyProducts") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Product not found");

    await ctx.db.patch(args.id, {
      isActive: !existing.isActive,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("agencyProducts") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Product not found");

    // Cascade delete related commissions
    const commissions = await ctx.db
      .query("carrierCommissions")
      .withIndex("by_product", (q) => q.eq("productId", args.id))
      .collect();
    for (const comm of commissions) {
      await ctx.db.delete(comm._id);
    }

    await ctx.db.delete(args.id);
  },
});
