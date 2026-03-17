import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ── Queries ──────────────────────────────────────────────────────────

export const getByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("aiCallHistory")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(args.limit ?? 100);

    // Join with contacts to get contact name
    return Promise.all(
      calls.map(async (call) => {
        let contactName: string | undefined;
        let contactPhone: string | undefined;
        if (call.contactId) {
          const contact = await ctx.db.get(call.contactId);
          if (contact) {
            contactName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || undefined;
            contactPhone = contact.phoneNumbers?.find((p) => p.isPrimary)?.number ?? contact.phoneNumbers?.[0]?.number;
          }
        }
        return {
          ...call,
          contactName: contactName ?? "Unknown",
          contactPhone,
        };
      })
    );
  },
});

export const getByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiCallHistory")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .order("desc")
      .collect();
  },
});

export const getByAgent = query({
  args: { retellAgentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiCallHistory")
      .withIndex("by_agent", (q) => q.eq("retellAgentId", args.retellAgentId))
      .order("desc")
      .collect();
  },
});

export const getStats = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("aiCallHistory")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const withDuration = all.filter((c) => c.durationMs != null);
    const avgDurationMs =
      withDuration.length > 0
        ? Math.round(
            withDuration.reduce((sum, c) => sum + (c.durationMs ?? 0), 0) /
              withDuration.length
          )
        : 0;

    // Sentiment breakdown
    const sentimentBreakdown = { positive: 0, negative: 0, neutral: 0 };
    for (const call of all) {
      if (call.userSentiment === "Positive") sentimentBreakdown.positive++;
      else if (call.userSentiment === "Negative") sentimentBreakdown.negative++;
      else if (call.userSentiment === "Neutral") sentimentBreakdown.neutral++;
    }

    const successfulCalls = all.filter((c) => c.callSuccessful === true);
    const evaluatedCalls = all.filter((c) => c.callSuccessful !== undefined);

    const totalCostCents = all.reduce(
      (sum, c) => sum + (c.callCostCents ?? 0),
      0
    );

    return {
      totalCalls: all.length,
      avgDurationMs,
      sentimentBreakdown,
      successRate:
        evaluatedCalls.length > 0
          ? Math.round((successfulCalls.length / evaluatedCalls.length) * 100)
          : 0,
      totalCostCents: Math.round(totalCostCents),
    };
  },
});

// ── Mutations ────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    retellAgentId: v.string(),
    retellCallId: v.string(),
    direction: v.string(),
    status: v.string(),
    fromNumber: v.string(),
    toNumber: v.string(),
    contactId: v.optional(v.id("contacts")),
    // Timing
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    // Transcript & Recording
    transcript: v.optional(v.string()),
    transcriptObject: v.optional(v.any()),
    recordingUrl: v.optional(v.string()),
    // Analysis
    callSummary: v.optional(v.string()),
    userSentiment: v.optional(v.string()),
    callSuccessful: v.optional(v.boolean()),
    customAnalysis: v.optional(v.any()),
    // Outcome
    disconnectionReason: v.optional(v.string()),
    transferDestination: v.optional(v.string()),
    // Cost
    callCostCents: v.optional(v.number()),
    // Workflow
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("aiCallHistory", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    retellCallId: v.string(),
    status: v.optional(v.string()),
    // Timing
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    // Transcript & Recording
    transcript: v.optional(v.string()),
    transcriptObject: v.optional(v.any()),
    recordingUrl: v.optional(v.string()),
    // Analysis
    callSummary: v.optional(v.string()),
    userSentiment: v.optional(v.string()),
    callSuccessful: v.optional(v.boolean()),
    customAnalysis: v.optional(v.any()),
    // Outcome
    disconnectionReason: v.optional(v.string()),
    transferDestination: v.optional(v.string()),
    // Cost
    callCostCents: v.optional(v.number()),
    // Contact (may be resolved after call starts)
    contactId: v.optional(v.id("contacts")),
  },
  handler: async (ctx, args) => {
    const { retellCallId, ...fields } = args;

    const existing = await ctx.db
      .query("aiCallHistory")
      .withIndex("by_retell_call_id", (q) =>
        q.eq("retellCallId", retellCallId)
      )
      .first();

    if (!existing) {
      throw new Error(`AI call history not found for retellCallId: ${retellCallId}`);
    }

    // Build patch object with only provided fields
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    await ctx.db.patch(existing._id, patch);
    return existing._id;
  },
});
