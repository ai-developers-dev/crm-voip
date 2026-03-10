import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("policies")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    policyNumber: v.string(),
    carrier: v.string(),
    type: v.union(
      v.literal("home"),
      v.literal("auto"),
      v.literal("life"),
      v.literal("health"),
      v.literal("umbrella"),
      v.literal("commercial"),
      v.literal("other")
    ),
    premiumAmount: v.optional(v.number()),
    premiumFrequency: v.optional(
      v.union(
        v.literal("monthly"),
        v.literal("quarterly"),
        v.literal("semi_annual"),
        v.literal("annual")
      )
    ),
    effectiveDate: v.optional(v.number()),
    expirationDate: v.optional(v.number()),
    description: v.optional(v.string()),
    createdByUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("policies", {
      ...args,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("policies"),
    policyNumber: v.optional(v.string()),
    carrier: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("home"),
        v.literal("auto"),
        v.literal("life"),
        v.literal("health"),
        v.literal("umbrella"),
        v.literal("commercial"),
        v.literal("other")
      )
    ),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("pending"),
        v.literal("expired"),
        v.literal("cancelled")
      )
    ),
    premiumAmount: v.optional(v.number()),
    premiumFrequency: v.optional(
      v.union(
        v.literal("monthly"),
        v.literal("quarterly"),
        v.literal("semi_annual"),
        v.literal("annual")
      )
    ),
    effectiveDate: v.optional(v.number()),
    expirationDate: v.optional(v.number()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Policy not found");
    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("policies") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
