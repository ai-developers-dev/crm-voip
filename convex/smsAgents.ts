import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { authorizeOrgMember } from "./lib/auth";

/** Get all SMS agents for an organization */
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("smsAgents")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

/** Get a single SMS agent by ID */
export const getById = query({
  args: { agentId: v.id("smsAgents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.agentId);
  },
});

/** Create a new SMS agent */
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    systemPrompt: v.string(),
    objective: v.optional(v.string()),
    model: v.optional(v.string()),
    temperature: v.optional(v.number()),
    maxTurns: v.optional(v.number()),
    enabledTools: v.optional(v.array(v.string())),
    beginMessage: v.optional(v.string()),
    handoffMessage: v.optional(v.string()),
    handoffPhoneNumber: v.optional(v.string()),
    handoffUserId: v.optional(v.id("users")),
    completionMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    const now = Date.now();
    return await ctx.db.insert("smsAgents", {
      organizationId: args.organizationId,
      name: args.name,
      description: args.description,
      systemPrompt: args.systemPrompt,
      objective: args.objective,
      model: args.model || "gpt-4.1-mini",
      temperature: args.temperature ?? 0.7,
      maxTurns: args.maxTurns ?? 20,
      enabledTools: args.enabledTools || ["book_appointment", "transfer_to_human", "end_conversation"],
      beginMessage: args.beginMessage,
      handoffMessage: args.handoffMessage || "Let me connect you with a team member who can help further.",
      handoffPhoneNumber: args.handoffPhoneNumber,
      handoffUserId: args.handoffUserId,
      completionMessage: args.completionMessage,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Update an SMS agent */
export const update = mutation({
  args: {
    agentId: v.id("smsAgents"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    objective: v.optional(v.string()),
    model: v.optional(v.string()),
    temperature: v.optional(v.number()),
    maxTurns: v.optional(v.number()),
    enabledTools: v.optional(v.array(v.string())),
    beginMessage: v.optional(v.string()),
    handoffMessage: v.optional(v.string()),
    handoffPhoneNumber: v.optional(v.string()),
    handoffUserId: v.optional(v.id("users")),
    completionMessage: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("SMS agent not found");
    await authorizeOrgMember(ctx, agent.organizationId);

    const { agentId, ...updates } = args;
    const patch: Record<string, any> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patch[key] = value;
    }
    await ctx.db.patch(agentId, patch);
  },
});

/** Delete an SMS agent */
export const remove = mutation({
  args: { agentId: v.id("smsAgents") },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("SMS agent not found");
    await authorizeOrgMember(ctx, agent.organizationId);
    await ctx.db.delete(args.agentId);
  },
});

/** Get AI conversations for an agent */
export const getConversations = query({
  args: {
    smsAgentId: v.id("smsAgents"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let conversations = await ctx.db
      .query("smsAgentConversations")
      .withIndex("by_agent", (q) => q.eq("smsAgentId", args.smsAgentId))
      .collect();

    if (args.status) {
      conversations = conversations.filter((c) => c.status === args.status);
    }

    return conversations.sort((a, b) => b.startedAt - a.startedAt);
  },
});

/** Get conversations for a contact */
export const getConversationsByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("smsAgentConversations")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
  },
});

/** Get a single conversation with full history */
export const getConversationById = query({
  args: { conversationId: v.id("smsAgentConversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.conversationId);
  },
});

/** Check if a contact has an active AI SMS conversation */
export const getActiveAiConversationForContact = query({
  args: {
    contactId: v.id("contacts"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const conversations = await ctx.db
      .query("smsAgentConversations")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
    return conversations.find(
      (c) => c.organizationId === args.organizationId && c.status === "active"
    ) || null;
  },
});

// ── Public mutations for AI SMS API route ─────────────────────────────

/** Add a user message to an AI conversation (called from API route) */
export const addUserMessage = mutation({
  args: {
    agentConversationId: v.id("smsAgentConversations"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.agentConversationId);
    if (!conversation || conversation.status !== "active") return;

    const agent = await ctx.db.get(conversation.smsAgentId);
    if (!agent) return;

    if (agent.maxTurns && conversation.turnCount >= agent.maxTurns) {
      await ctx.db.patch(args.agentConversationId, {
        status: "expired",
        completedAt: Date.now(),
      });
      return;
    }

    await ctx.db.patch(args.agentConversationId, {
      aiMessages: [
        ...conversation.aiMessages,
        { role: "user", content: args.message, timestamp: Date.now() },
      ],
      turnCount: conversation.turnCount + 1,
    });
  },
});

/** Save AI assistant response (called from API route after OpenAI responds) */
export const saveAiResponse = mutation({
  args: {
    agentConversationId: v.id("smsAgentConversations"),
    message: v.string(),
    toolCalls: v.optional(v.any()),
    tokensUsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.agentConversationId);
    if (!conversation) return;

    await ctx.db.patch(args.agentConversationId, {
      aiMessages: [
        ...conversation.aiMessages,
        {
          role: "assistant",
          content: args.message,
          toolCalls: args.toolCalls,
          timestamp: Date.now(),
        },
      ],
      totalTokensUsed: (conversation.totalTokensUsed || 0) + (args.tokensUsed || 0),
    });
  },
});

/** Hand off conversation to a human (called from API route) */
export const handoffToHuman = mutation({
  args: {
    agentConversationId: v.id("smsAgentConversations"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.agentConversationId, {
      status: "handed_off",
      handoffReason: args.reason || "AI requested human assistance",
      completedAt: Date.now(),
    });
  },
});

/** Mark conversation as completed (called from API route) */
export const completeConversation = mutation({
  args: { agentConversationId: v.id("smsAgentConversations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.agentConversationId, {
      status: "completed",
      objectiveAchieved: true,
      completedAt: Date.now(),
    });
  },
});

/** Create task from AI agent */
export const createTaskFromAi = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const systemUser = users.find((u) => u.role === "tenant_admin") || users[0];
    if (!systemUser) return;

    const now = Date.now();
    await ctx.db.insert("tasks", {
      organizationId: args.organizationId,
      contactId: args.contactId,
      title: args.title,
      description: args.description,
      type: "follow_up",
      priority: (args.priority as any) || "medium",
      status: "todo",
      assignedToUserId: systemUser._id,
      createdByUserId: systemUser._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Create appointment from AI agent (no user auth required) */
export const createAppointmentFromAi = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    title: v.string(),
    appointmentDate: v.number(),
    endDate: v.optional(v.number()),
    type: v.union(v.literal("meeting"), v.literal("call"), v.literal("video"), v.literal("other")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // Get a system user for createdByUserId
    const users = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const systemUser = users.find((u) => u.role === "tenant_admin") || users[0];
    if (!systemUser) throw new Error("No users in organization");

    return await ctx.db.insert("appointments", {
      organizationId: args.organizationId,
      contactId: args.contactId,
      title: args.title,
      appointmentDate: args.appointmentDate,
      endDate: args.endDate,
      type: args.type,
      status: "scheduled",
      createdByUserId: systemUser._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Send an AI message via SMS (called from API route — delegates to internal engine) */
export const sendAiMessage = mutation({
  args: {
    agentConversationId: v.id("smsAgentConversations"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.smsAiEngine.sendAiMessage, {
      agentConversationId: args.agentConversationId,
      message: args.message,
    });
  },
});
