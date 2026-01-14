import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

// Helper to get today's date string in UTC
function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
}

// Internal mutation to increment call count when call is answered
export const incrementCallsAccepted = internalMutation({
  args: {
    userId: v.id("users"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const today = getTodayDateString();
    const existing = await ctx.db
      .query("userDailyMetrics")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.userId).eq("date", today)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        callsAccepted: existing.callsAccepted + 1,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userDailyMetrics", {
        userId: args.userId,
        organizationId: args.organizationId,
        date: today,
        callsAccepted: 1,
        talkTimeSeconds: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

// Internal mutation to add talk time when call ends
export const addTalkTime = internalMutation({
  args: {
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    talkTimeSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const today = getTodayDateString();
    const existing = await ctx.db
      .query("userDailyMetrics")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.userId).eq("date", today)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        talkTimeSeconds: existing.talkTimeSeconds + args.talkTimeSeconds,
        updatedAt: Date.now(),
      });
    } else {
      // Edge case: call ended but no existing record (shouldn't happen normally)
      await ctx.db.insert("userDailyMetrics", {
        userId: args.userId,
        organizationId: args.organizationId,
        date: today,
        callsAccepted: 0,
        talkTimeSeconds: args.talkTimeSeconds,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

// Query to get today's metrics for all users in an organization
export const getOrganizationMetricsToday = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const today = getTodayDateString();
    return await ctx.db
      .query("userDailyMetrics")
      .withIndex("by_organization_date", (q) =>
        q.eq("organizationId", args.organizationId).eq("date", today)
      )
      .collect();
  },
});
