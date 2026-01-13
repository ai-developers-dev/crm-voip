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
