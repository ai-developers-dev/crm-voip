import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { authorizeOrgMember } from "./lib/auth";

// ── Queries ──────────────────────────────────────────────────────────

export const listByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const quotes = await ctx.db
      .query("insuranceQuotes")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(args.limit ?? 100);

    return Promise.all(
      quotes.map(async (q) => {
        const lead = await ctx.db.get(q.insuranceLeadId);
        return {
          ...q,
          leadName: lead ? `${lead.firstName} ${lead.lastName}` : "Unknown",
          leadEmail: lead?.email,
          leadPhone: lead?.phone,
        };
      })
    );
  },
});

export const listByLead = query({
  args: { insuranceLeadId: v.id("insuranceLeads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("insuranceQuotes")
      .withIndex("by_lead", (q) => q.eq("insuranceLeadId", args.insuranceLeadId))
      .order("desc")
      .collect();
  },
});

export const getStats = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("insuranceQuotes")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();

    const todayQuotes = all.filter((q) => q.quotedAt >= todayTs);
    const successful = all.filter((q) => q.status === "success");
    const todaySuccessful = todayQuotes.filter((q) => q.status === "success");

    const avgPremium =
      successful.length > 0
        ? successful.reduce((sum, q) => sum + (q.monthlyPremium ?? 0), 0) / successful.length
        : 0;

    const byPortal: Record<string, number> = {};
    for (const q of successful) {
      byPortal[q.portal] = (byPortal[q.portal] ?? 0) + 1;
    }

    const byType: Record<string, number> = {};
    for (const q of successful) {
      byType[q.type] = (byType[q.type] ?? 0) + 1;
    }

    return {
      total: all.length,
      totalToday: todayQuotes.length,
      successful: successful.length,
      successfulToday: todaySuccessful.length,
      errors: all.filter((q) => q.status === "error").length,
      successRate: all.length > 0 ? Math.round((successful.length / all.length) * 100) : 0,
      avgMonthlyPremium: Math.round(avgPremium),
      byPortal,
      byType,
    };
  },
});

// ── Mutations ────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    insuranceLeadId: v.id("insuranceLeads"),
    portal: v.string(),
    type: v.string(),
    status: v.string(),
    carrier: v.optional(v.string()),
    quoteId: v.optional(v.string()),
    monthlyPremium: v.optional(v.number()),
    annualPremium: v.optional(v.number()),
    coverageDetails: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);

    return await ctx.db.insert("insuranceQuotes", {
      ...args,
      quotedAt: Date.now(),
    });
  },
});
