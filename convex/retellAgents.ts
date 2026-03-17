import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ── Queries ──────────────────────────────────────────────────────────

export const getByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("retellAgents")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    // Sort by name alphabetically
    return agents.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getById = query({
  args: { id: v.id("retellAgents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByRetellId = query({
  args: { retellAgentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("retellAgents")
      .withIndex("by_retell_agent_id", (q) =>
        q.eq("retellAgentId", args.retellAgentId)
      )
      .first();
  },
});

export const getByPhoneNumber = query({
  args: { assignedPhoneNumberId: v.id("phoneNumbers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("retellAgents")
      .withIndex("by_phone_number", (q) =>
        q.eq("assignedPhoneNumberId", args.assignedPhoneNumberId)
      )
      .first();
  },
});

// ── Mutations ────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    retellAgentId: v.string(),
    name: v.string(),
    type: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    // Voice
    voiceId: v.string(),
    voiceModel: v.optional(v.string()),
    voiceSpeed: v.optional(v.number()),
    voiceTemperature: v.optional(v.number()),
    language: v.optional(v.string()),
    // LLM
    retellLlmId: v.optional(v.string()),
    generalPrompt: v.string(),
    beginMessage: v.optional(v.string()),
    model: v.optional(v.string()),
    modelTemperature: v.optional(v.number()),
    // Conversation
    responsiveness: v.optional(v.number()),
    interruptionSensitivity: v.optional(v.number()),
    enableBackchannel: v.optional(v.boolean()),
    ambientSound: v.optional(v.string()),
    maxCallDurationMs: v.optional(v.number()),
    endCallAfterSilenceMs: v.optional(v.number()),
    // Voicemail
    enableVoicemailDetection: v.optional(v.boolean()),
    voicemailMessage: v.optional(v.string()),
    // Analysis
    analysisSummaryPrompt: v.optional(v.string()),
    analysisSuccessPrompt: v.optional(v.string()),
    postCallAnalysisFields: v.optional(v.any()),
    // Transfer
    enableTransferToHuman: v.optional(v.boolean()),
    transferPhoneNumber: v.optional(v.string()),
    // Phone number
    assignedPhoneNumberId: v.optional(v.id("phoneNumbers")),
    webhookUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("retellAgents", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("retellAgents"),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    // Voice
    voiceId: v.optional(v.string()),
    voiceModel: v.optional(v.string()),
    voiceSpeed: v.optional(v.number()),
    voiceTemperature: v.optional(v.number()),
    language: v.optional(v.string()),
    // LLM
    retellLlmId: v.optional(v.string()),
    generalPrompt: v.optional(v.string()),
    beginMessage: v.optional(v.string()),
    model: v.optional(v.string()),
    modelTemperature: v.optional(v.number()),
    // Conversation
    responsiveness: v.optional(v.number()),
    interruptionSensitivity: v.optional(v.number()),
    enableBackchannel: v.optional(v.boolean()),
    ambientSound: v.optional(v.string()),
    maxCallDurationMs: v.optional(v.number()),
    endCallAfterSilenceMs: v.optional(v.number()),
    // Voicemail
    enableVoicemailDetection: v.optional(v.boolean()),
    voicemailMessage: v.optional(v.string()),
    // Analysis
    analysisSummaryPrompt: v.optional(v.string()),
    analysisSuccessPrompt: v.optional(v.string()),
    postCallAnalysisFields: v.optional(v.any()),
    // Transfer
    enableTransferToHuman: v.optional(v.boolean()),
    transferPhoneNumber: v.optional(v.string()),
    // Phone number
    assignedPhoneNumberId: v.optional(v.id("phoneNumbers")),
    webhookUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;

    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Retell agent not found");
    }

    // Build patch object with only provided fields
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("retellAgents") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Retell agent not found");
    }
    await ctx.db.delete(args.id);
  },
});

export const toggleActive = mutation({
  args: { id: v.id("retellAgents") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Retell agent not found");
    }
    await ctx.db.patch(args.id, {
      isActive: !existing.isActive,
      updatedAt: Date.now(),
    });
    return !existing.isActive;
  },
});
