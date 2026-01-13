import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Query to get all online users in an organization
export const getOnlineUsers = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const presenceRecords = await ctx.db
      .query("presence")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Filter to only recent heartbeats (within last 30 seconds)
    const now = Date.now();
    const activePresence = presenceRecords.filter(
      (p) => now - p.lastHeartbeat < 30000 && p.status !== "offline"
    );

    // Get user details for each presence record
    const usersWithPresence = await Promise.all(
      activePresence.map(async (presence) => {
        const user = await ctx.db.get(presence.userId);
        return {
          ...user,
          presence,
        };
      })
    );

    return usersWithPresence.filter((u) => u !== null);
  },
});

// Query to get presence for a specific user
export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

// Mutation to update presence (heartbeat)
export const heartbeat = mutation({
  args: {
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    status: v.union(
      v.literal("available"),
      v.literal("busy"),
      v.literal("on_call"),
      v.literal("on_break"),
      v.literal("offline")
    ),
    currentCallId: v.optional(v.id("activeCalls")),
    deviceInfo: v.optional(
      v.object({
        browser: v.string(),
        os: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        lastHeartbeat: Date.now(),
        currentCallId: args.currentCallId,
        deviceInfo: args.deviceInfo,
      });
      return existing._id;
    }

    return await ctx.db.insert("presence", {
      organizationId: args.organizationId,
      userId: args.userId,
      status: args.status,
      lastHeartbeat: Date.now(),
      currentCallId: args.currentCallId,
      deviceInfo: args.deviceInfo,
    });
  },
});

// Mutation to update status
export const updateStatus = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(
      v.literal("available"),
      v.literal("busy"),
      v.literal("on_call"),
      v.literal("on_break"),
      v.literal("offline")
    ),
    statusMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        statusMessage: args.statusMessage,
        lastHeartbeat: Date.now(),
      });
    }

    // Also update user record
    await ctx.db.patch(args.userId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

// Mutation to go offline
export const goOffline = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "offline",
        lastHeartbeat: Date.now(),
        currentCallId: undefined,
      });
    }

    await ctx.db.patch(args.userId, {
      status: "offline",
      updatedAt: Date.now(),
    });
  },
});
