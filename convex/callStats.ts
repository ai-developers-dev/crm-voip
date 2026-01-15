import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Helper function to get the start of today in UTC (midnight)
 */
function getTodayStartTimestamp(): number {
  const now = new Date();
  const todayUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  return todayUTC.getTime();
}

/**
 * Get call statistics for a single user for today
 */
export const getUserStatsToday = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const todayStart = getTodayStartTimestamp();

    const calls = await ctx.db
      .query("callHistory")
      .withIndex("by_user_date", (q) =>
        q.eq("handledByUserId", args.userId).gte("startedAt", todayStart)
      )
      .collect();

    return {
      inboundCalls: calls.filter(
        (c) => c.direction === "inbound" && c.outcome === "answered"
      ).length,
      outboundCalls: calls.filter((c) => c.direction === "outbound").length,
      missedCalls: calls.filter((c) => c.outcome === "missed").length,
      totalTalkTime: calls.reduce((sum, c) => sum + (c.talkTime || 0), 0),
      totalCalls: calls.length,
    };
  },
});

/**
 * Get call statistics for all users in an organization for today
 * Returns a map of userId -> stats
 */
export const getOrganizationStatsToday = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const todayStart = getTodayStartTimestamp();

    const calls = await ctx.db
      .query("callHistory")
      .withIndex("by_organization_date", (q) =>
        q.eq("organizationId", args.organizationId).gte("startedAt", todayStart)
      )
      .collect();

    // Calculate organization totals
    const orgTotals = {
      totalCalls: calls.length,
      inboundAnswered: calls.filter(
        (c) => c.direction === "inbound" && c.outcome === "answered"
      ).length,
      inboundMissed: calls.filter(
        (c) => c.direction === "inbound" && c.outcome === "missed"
      ).length,
      outbound: calls.filter((c) => c.direction === "outbound").length,
      totalTalkTime: calls.reduce((sum, c) => sum + (c.talkTime || 0), 0),
    };

    // Group stats by user
    const statsByUser = new Map<
      string,
      { inbound: number; outbound: number; missed: number; talkTime: number }
    >();

    for (const call of calls) {
      if (!call.handledByUserId) continue;
      const odUserId = call.handledByUserId.toString();
      const current = statsByUser.get(odUserId) || {
        inbound: 0,
        outbound: 0,
        missed: 0,
        talkTime: 0,
      };

      if (call.direction === "inbound" && call.outcome === "answered") {
        current.inbound++;
      }
      if (call.direction === "outbound") {
        current.outbound++;
      }
      if (call.outcome === "missed") {
        current.missed++;
      }
      current.talkTime += call.talkTime || 0;

      statsByUser.set(odUserId, current);
    }

    return {
      organization: orgTotals,
      byUser: Object.fromEntries(statsByUser),
    };
  },
});

/**
 * Get call statistics for a date range
 * Optionally filter by user
 */
export const getStatsForDateRange = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.number(), // timestamp
    endDate: v.number(), // timestamp
    userId: v.optional(v.id("users")), // optional filter by user
  },
  handler: async (ctx, args) => {
    let calls = await ctx.db
      .query("callHistory")
      .withIndex("by_organization_date", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("startedAt", args.startDate)
          .lte("startedAt", args.endDate)
      )
      .collect();

    // Filter by user if specified
    if (args.userId) {
      calls = calls.filter((c) => c.handledByUserId === args.userId);
    }

    const answeredCalls = calls.filter((c) => c.talkTime && c.talkTime > 0);

    return {
      totalCalls: calls.length,
      inboundAnswered: calls.filter(
        (c) => c.direction === "inbound" && c.outcome === "answered"
      ).length,
      inboundMissed: calls.filter(
        (c) => c.direction === "inbound" && c.outcome === "missed"
      ).length,
      outbound: calls.filter((c) => c.direction === "outbound").length,
      totalTalkTime: calls.reduce((sum, c) => sum + (c.talkTime || 0), 0),
      avgTalkTime:
        answeredCalls.length > 0
          ? Math.round(
              answeredCalls.reduce((sum, c) => sum + (c.talkTime || 0), 0) /
                answeredCalls.length
            )
          : 0,
    };
  },
});

/**
 * Get all users in an organization with their call stats for today
 * This is used by the stats page to show a table of all agents
 */
export const getUsersWithStats = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const todayStart = getTodayStartTimestamp();

    // Get all users in the organization
    const users = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    // Get today's completed calls for this org
    const todayCalls = await ctx.db
      .query("callHistory")
      .withIndex("by_organization_date", (q) =>
        q.eq("organizationId", args.organizationId).gte("startedAt", todayStart)
      )
      .collect();

    // Build stats map by user ID
    const statsMap = new Map<
      string,
      { inbound: number; outbound: number; missed: number; talkTime: number }
    >();

    for (const call of todayCalls) {
      if (!call.handledByUserId) continue;
      const odUserId = call.handledByUserId.toString();
      const current = statsMap.get(odUserId) || {
        inbound: 0,
        outbound: 0,
        missed: 0,
        talkTime: 0,
      };

      if (call.direction === "inbound" && call.outcome === "answered") {
        current.inbound++;
      }
      if (call.direction === "outbound") {
        current.outbound++;
      }
      if (call.outcome === "missed") {
        current.missed++;
      }
      current.talkTime += call.talkTime || 0;

      statsMap.set(odUserId, current);
    }

    // Combine users with their stats
    return users.map((user) => {
      const stats = statsMap.get(user._id.toString()) || {
        inbound: 0,
        outbound: 0,
        missed: 0,
        talkTime: 0,
      };

      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        avatarUrl: user.avatarUrl,
        stats: {
          inboundCalls: stats.inbound,
          outboundCalls: stats.outbound,
          missedCalls: stats.missed,
          totalCalls: stats.inbound + stats.outbound,
          talkTimeSeconds: stats.talkTime,
        },
      };
    });
  },
});
