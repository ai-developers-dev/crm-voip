import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { authorizeOrgMember, authorizeOrgAdmin } from "./lib/auth";

// Real Twilio IncomingPhoneNumber SIDs always start with "PN" + 32 hex chars.
// Reject anything else (placeholders, test data, copy-paste errors) so we
// never store a phone number that isn't actually owned by the tenant in Twilio.
const TWILIO_PN_SID_REGEX = /^PN[a-f0-9]{32}$/i;

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

// Create a phone number record.
// Only called from /api/twilio/numbers after a real Twilio purchase,
// so the twilioSid must match the PN SID format.
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
    await authorizeOrgMember(ctx, args.organizationId);

    if (!TWILIO_PN_SID_REGEX.test(args.twilioSid)) {
      throw new Error(
        `Invalid Twilio Phone Number SID "${args.twilioSid}". Must start with "PN" followed by 32 hex characters. Numbers can only be added by purchasing them through the app.`
      );
    }

    // Prevent duplicate records (same SID already stored)
    const existing = await ctx.db
      .query("phoneNumbers")
      .withIndex("by_phone_number", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();
    if (existing) {
      throw new Error(`Phone number ${args.phoneNumber} is already registered in the system.`);
    }

    return await ctx.db.insert("phoneNumbers", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// One-time cleanup: delete phone number records whose twilioSid is not a real
// Twilio PN SID. These were seed/placeholder rows from early development.
// Internal — only callable via `npx convex run phoneNumbers:cleanupInvalid`.
export const cleanupInvalid = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("phoneNumbers").collect();
    const invalid = all.filter((n) => !TWILIO_PN_SID_REGEX.test(n.twilioSid));
    for (const row of invalid) {
      await ctx.db.delete(row._id);
    }
    return {
      scanned: all.length,
      deleted: invalid.length,
      deletedRows: invalid.map((n) => ({
        _id: n._id,
        phoneNumber: n.phoneNumber,
        twilioSid: n.twilioSid,
        organizationId: n.organizationId,
      })),
    };
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
    await authorizeOrgMember(ctx, args.organizationId);

    if (!TWILIO_PN_SID_REGEX.test(args.twilioSid)) {
      throw new Error(
        `Invalid Twilio Phone Number SID "${args.twilioSid}". Must start with "PN" followed by 32 hex characters.`
      );
    }

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

// Mutation to delete a phone number record (called after releasing via Twilio)
export const remove = mutation({
  args: { phoneNumberId: v.id("phoneNumbers") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.phoneNumberId);
    if (!row) return;
    await authorizeOrgMember(ctx, row.organizationId);
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

// Mutation to update the Twilio IncomingPhoneNumber config mirror.
// Called only from the updatePhoneNumberTwilioConfig server action after
// a successful Twilio API call. Admin-level since this affects call routing.
export const updateTwilioConfig = mutation({
  args: {
    phoneNumberId: v.id("phoneNumbers"),
    config: v.object({
      // Voice
      voiceUrl: v.optional(v.string()),
      voiceMethod: v.optional(v.union(v.literal("POST"), v.literal("GET"))),
      voiceFallbackUrl: v.optional(v.string()),
      voiceFallbackMethod: v.optional(v.union(v.literal("POST"), v.literal("GET"))),
      statusCallbackUrl: v.optional(v.string()),
      statusCallbackMethod: v.optional(v.union(v.literal("POST"), v.literal("GET"))),
      voiceCallerIdLookup: v.optional(v.boolean()),
      voiceReceiveMode: v.optional(v.union(v.literal("voice"), v.literal("fax"))),
      // Messaging
      smsUrl: v.optional(v.string()),
      smsMethod: v.optional(v.union(v.literal("POST"), v.literal("GET"))),
      smsFallbackUrl: v.optional(v.string()),
      smsFallbackMethod: v.optional(v.union(v.literal("POST"), v.literal("GET"))),
    }),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.phoneNumberId);
    if (!row) throw new Error("Phone number not found");
    await authorizeOrgAdmin(ctx, row.organizationId);

    await ctx.db.patch(args.phoneNumberId, {
      twilioConfig: {
        ...args.config,
        lastSyncedAt: Date.now(),
      },
    });
  },
});
