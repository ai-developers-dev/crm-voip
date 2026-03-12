import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** List all sales goals for an organization, sorted by year desc then month desc */
export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const goals = await ctx.db
      .query("salesGoals")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    return goals.sort((a, b) =>
      a.year !== b.year ? b.year - a.year : b.month - a.month
    );
  },
});

/** Get the sales goal for a specific month/year */
export const getForMonth = query({
  args: {
    organizationId: v.id("organizations"),
    month: v.number(),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("salesGoals")
      .withIndex("by_org_year_month", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("year", args.year)
          .eq("month", args.month)
      )
      .first();
  },
});

/** Create or update a sales goal for a specific month */
export const upsert = mutation({
  args: {
    organizationId: v.id("organizations"),
    month: v.number(),
    year: v.number(),
    dailyPremium: v.optional(v.number()),
    weeklyPremium: v.optional(v.number()),
    monthlyPremium: v.optional(v.number()),
    dailyPolicies: v.optional(v.number()),
    weeklyPolicies: v.optional(v.number()),
    monthlyPolicies: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("salesGoals")
      .withIndex("by_org_year_month", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("year", args.year)
          .eq("month", args.month)
      )
      .first();

    const now = Date.now();
    const data = {
      dailyPremium: args.dailyPremium,
      weeklyPremium: args.weeklyPremium,
      monthlyPremium: args.monthlyPremium,
      dailyPolicies: args.dailyPolicies,
      weeklyPolicies: args.weeklyPolicies,
      monthlyPolicies: args.monthlyPolicies,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("salesGoals", {
        organizationId: args.organizationId,
        month: args.month,
        year: args.year,
        ...data,
        createdAt: now,
      });
    }
  },
});

/** Delete a sales goal */
export const remove = mutation({
  args: { goalId: v.id("salesGoals") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.goalId);
  },
});
