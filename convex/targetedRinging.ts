import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Targeted ringing - shows incoming call only in specific user's card
// Create a targeted ringing record when unparking to a specific user
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    targetUserId: v.id("users"),
    callerNumber: v.string(),
    callerName: v.optional(v.string()),
    pstnCallSid: v.string(),
  },
  handler: async (ctx, args) => {
    // Clean up any existing ringing records for this PSTN call
    const existing = await ctx.db
      .query("targetedRinging")
      .withIndex("by_pstn_sid", (q) => q.eq("pstnCallSid", args.pstnCallSid))
      .collect();

    for (const record of existing) {
      await ctx.db.delete(record._id);
    }

    // Create new targeted ringing record (expires in 30 seconds)
    const id = await ctx.db.insert("targetedRinging", {
      organizationId: args.organizationId,
      targetUserId: args.targetUserId,
      callerNumber: args.callerNumber,
      callerName: args.callerName,
      pstnCallSid: args.pstnCallSid,
      status: "ringing",
      createdAt: Date.now(),
      expiresAt: Date.now() + 30000, // 30 second timeout
    });

    console.log(`🔔 Created targeted ringing for ${args.callerNumber} -> user ${args.targetUserId}`);
    return id;
  },
});

// Get ringing call for a specific user
export const getForUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("targetedRinging")
      .withIndex("by_target_user", (q) =>
        q.eq("targetUserId", args.userId).eq("status", "ringing")
      )
      .first();

    // Debug logging
    if (record) {
      console.log(`🎯 getForUser(${args.userId}): Found record`, {
        callerNumber: record.callerNumber,
        status: record.status,
        expired: record.expiresAt < Date.now(),
      });
    }

    // Check if expired
    if (record && record.expiresAt < Date.now()) {
      return null;
    }

    return record;
  },
});

// Get all ringing calls for an organization (to filter from global banner)
export const getActiveForOrg = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("targetedRinging")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => q.eq(q.field("status"), "ringing"))
      .collect();

    // Filter out expired ones
    const now = Date.now();
    return records.filter((r) => r.expiresAt > now);
  },
});

// Update the agent callSid after the call is created
export const setAgentCallSid = mutation({
  args: {
    pstnCallSid: v.string(),
    agentCallSid: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("targetedRinging")
      .withIndex("by_pstn_sid", (q) => q.eq("pstnCallSid", args.pstnCallSid))
      .filter((q) => q.eq(q.field("status"), "ringing"))
      .first();

    if (!record) {
      console.log(`No ringing targetedRinging found for PSTN SID: ${args.pstnCallSid}`);
      return { success: false, reason: "not_found" };
    }

    await ctx.db.patch(record._id, {
      agentCallSid: args.agentCallSid,
    });

    console.log(`📞 Updated targetedRinging with agentCallSid: ${args.agentCallSid}`);
    return { success: true };
  },
});

// Accept the targeted call
export const accept = mutation({
  args: {
    id: v.id("targetedRinging"),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) {
      return { success: false, reason: "not_found" };
    }

    await ctx.db.patch(args.id, {
      status: "accepted",
    });

    console.log(`✅ Targeted call accepted: ${record.callerNumber}`);
    return { success: true };
  },
});

// Decline the targeted call
export const decline = mutation({
  args: {
    id: v.id("targetedRinging"),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) {
      return { success: false, reason: "not_found" };
    }

    await ctx.db.patch(args.id, {
      status: "declined",
    });

    console.log(`❌ Targeted call declined: ${record.callerNumber}`);
    return { success: true, pstnCallSid: record.pstnCallSid };
  },
});

// Clear expired or completed records (cleanup)
export const cleanup = mutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("targetedRinging")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const now = Date.now();
    let cleaned = 0;

    for (const record of records) {
      // Delete if expired or not ringing
      if (record.expiresAt < now || record.status !== "ringing") {
        await ctx.db.delete(record._id);
        cleaned++;
      }
    }

    return { cleaned };
  },
});
