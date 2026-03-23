import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Query to get all phone numbers for an organization
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("phoneNumbers")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

// Get a single phone number by ID
export const getById = query({
  args: { id: v.id("phoneNumbers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Create a phone number record
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    phoneNumber: v.string(),
    twilioSid: v.string(),
    friendlyName: v.string(),
    type: v.union(v.literal("main"), v.literal("department"), v.literal("direct"), v.literal("tracking")),
    routingType: v.union(v.literal("ring_all"), v.literal("round_robin"), v.literal("least_recent"), v.literal("direct")),
    voicemailEnabled: v.boolean(),
    isActive: v.boolean(),
    monthlyCost: v.optional(v.number()),
    purchasedAt: v.optional(v.number()),
    capabilities: v.optional(v.object({
      voice: v.boolean(),
      sms: v.boolean(),
      mms: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("phoneNumbers", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// Internal query to get phone number by number (for webhooks)
export const getByNumber = internalQuery({
  args: { phoneNumber: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("phoneNumbers")
      .withIndex("by_phone_number", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();
  },
});

// Public query to look up phone number (for Next.js API webhooks)
export const lookupByNumber = query({
  args: { phoneNumber: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("phoneNumbers")
      .withIndex("by_phone_number", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();
  },
});

// Mutation to add a phone number
export const add = mutation({
  args: {
    organizationId: v.id("organizations"),
    phoneNumber: v.string(),
    twilioSid: v.string(),
    friendlyName: v.string(),
    type: v.union(
      v.literal("main"),
      v.literal("department"),
      v.literal("direct"),
      v.literal("tracking")
    ),
    routingType: v.union(
      v.literal("ring_all"),
      v.literal("round_robin"),
      v.literal("least_recent"),
      v.literal("direct")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("phoneNumbers", {
      organizationId: args.organizationId,
      phoneNumber: args.phoneNumber,
      twilioSid: args.twilioSid,
      friendlyName: args.friendlyName,
      type: args.type,
      routingType: args.routingType,
      voicemailEnabled: false,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

// Mutation to update phone number settings
export const update = mutation({
  args: {
    phoneNumberId: v.id("phoneNumbers"),
    friendlyName: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("main"),
        v.literal("department"),
        v.literal("direct"),
        v.literal("tracking")
      )
    ),
    routingType: v.optional(
      v.union(
        v.literal("ring_all"),
        v.literal("round_robin"),
        v.literal("least_recent"),
        v.literal("direct")
      )
    ),
    assignedUserId: v.optional(v.id("users")),
    voicemailEnabled: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { phoneNumberId, ...updates } = args;

    // Remove undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(phoneNumberId, cleanUpdates);
  },
});

// Mutation to delete a phone number
export const remove = mutation({
  args: { phoneNumberId: v.id("phoneNumbers") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.phoneNumberId);
  },
});

// Update phone number routing configuration
export const updateRouting = mutation({
  args: {
    phoneNumberId: v.id("phoneNumbers"),
    type: v.optional(v.union(v.literal("main"), v.literal("department"), v.literal("direct"), v.literal("tracking"))),
    routingType: v.union(v.literal("ring_all"), v.literal("round_robin"), v.literal("least_recent"), v.literal("direct"), v.literal("ring_group")),
    assignedUserId: v.optional(v.id("users")),
    ringGroupUserIds: v.optional(v.array(v.id("users"))),
    voicemailEnabled: v.optional(v.boolean()),
    friendlyName: v.optional(v.string()),
    // Unanswered fallback
    unansweredAction: v.optional(v.union(v.literal("voicemail"), v.literal("parking"), v.literal("ai_agent"))),
    unansweredTimeoutSeconds: v.optional(v.number()),
    unansweredAiAgentId: v.optional(v.id("retellAgents")),
    voicemailGreeting: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { phoneNumberId, ...updates } = args;
    const phone = await ctx.db.get(phoneNumberId);
    if (!phone) throw new Error("Phone number not found");

    const patch: Record<string, any> = {
      routingType: updates.routingType,
    };

    if (updates.type !== undefined) patch.type = updates.type;
    if (updates.friendlyName !== undefined) patch.friendlyName = updates.friendlyName;
    if (updates.voicemailEnabled !== undefined) patch.voicemailEnabled = updates.voicemailEnabled;

    // Unanswered fallback settings
    if (updates.unansweredAction !== undefined) patch.unansweredAction = updates.unansweredAction;
    if (updates.unansweredTimeoutSeconds !== undefined) patch.unansweredTimeoutSeconds = updates.unansweredTimeoutSeconds;
    if (updates.unansweredAiAgentId !== undefined) patch.unansweredAiAgentId = updates.unansweredAiAgentId;
    if (updates.voicemailGreeting !== undefined) patch.voicemailGreeting = updates.voicemailGreeting;

    // Clear AI agent if not using AI fallback
    if (updates.unansweredAction && updates.unansweredAction !== "ai_agent") {
      patch.unansweredAiAgentId = undefined;
    }

    // Set/clear assignment based on routing type
    if (updates.routingType === "direct") {
      patch.assignedUserId = updates.assignedUserId || null;
      patch.ringGroupUserIds = undefined;
    } else if (updates.routingType === "ring_group") {
      patch.ringGroupUserIds = updates.ringGroupUserIds || [];
      patch.assignedUserId = undefined;
    } else {
      patch.assignedUserId = undefined;
      patch.ringGroupUserIds = undefined;
    }

    await ctx.db.patch(phoneNumberId, patch);
  },
});
