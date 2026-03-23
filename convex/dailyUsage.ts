import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

/** Get or create today's usage record for an organization */
async function getOrCreateToday(ctx: any, organizationId: any) {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const existing = await ctx.db
    .query("dailyUsage")
    .withIndex("by_organization_date", (q: any) =>
      q.eq("organizationId", organizationId).eq("date", today)
    )
    .first();

  if (existing) return existing;

  const now = Date.now();
  const id = await ctx.db.insert("dailyUsage", {
    organizationId,
    date: today,
    totalCalls: 0,
    inboundCalls: 0,
    outboundCalls: 0,
    missedCalls: 0,
    totalCallMinutes: 0,
    totalSms: 0,
    inboundSms: 0,
    outboundSms: 0,
    activeUsers: 0,
    peakConcurrentCalls: 0,
    createdAt: now,
    updatedAt: now,
  });
  return await ctx.db.get(id);
}

/** Increment call usage (called after each call ends) */
export const recordCall = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    direction: v.string(), // "inbound" | "outbound"
    durationMinutes: v.number(),
    missed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const record = await getOrCreateToday(ctx, args.organizationId);
    const patch: Record<string, any> = {
      totalCalls: record.totalCalls + 1,
      totalCallMinutes: record.totalCallMinutes + args.durationMinutes,
      updatedAt: Date.now(),
    };
    if (args.direction === "inbound") patch.inboundCalls = record.inboundCalls + 1;
    if (args.direction === "outbound") patch.outboundCalls = record.outboundCalls + 1;
    if (args.missed) patch.missedCalls = record.missedCalls + 1;
    await ctx.db.patch(record._id, patch);
  },
});

/** Increment SMS usage (called after each SMS sent/received) */
export const recordSms = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    direction: v.string(), // "inbound" | "outbound"
  },
  handler: async (ctx, args) => {
    const record = await getOrCreateToday(ctx, args.organizationId);
    const patch: Record<string, any> = {
      totalSms: record.totalSms + 1,
      updatedAt: Date.now(),
    };
    if (args.direction === "inbound") patch.inboundSms = record.inboundSms + 1;
    if (args.direction === "outbound") patch.outboundSms = record.outboundSms + 1;
    await ctx.db.patch(record._id, patch);
  },
});

/** Get usage for a date range (for billing calculations) */
export const getForDateRange = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("dailyUsage")
      .withIndex("by_organization_date", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    return records.filter((r) => r.date >= args.startDate && r.date <= args.endDate);
  },
});

/** Get monthly totals for an organization */
export const getMonthlyTotals = query({
  args: {
    organizationId: v.id("organizations"),
    year: v.number(),
    month: v.number(),
  },
  handler: async (ctx, args) => {
    const startDate = `${args.year}-${String(args.month + 1).padStart(2, "0")}-01`;
    const endMonth = args.month === 11 ? 1 : args.month + 2;
    const endYear = args.month === 11 ? args.year + 1 : args.year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    const records = await ctx.db
      .query("dailyUsage")
      .withIndex("by_organization_date", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const filtered = records.filter((r) => r.date >= startDate && r.date < endDate);

    return {
      totalCalls: filtered.reduce((s, r) => s + r.totalCalls, 0),
      inboundCalls: filtered.reduce((s, r) => s + r.inboundCalls, 0),
      outboundCalls: filtered.reduce((s, r) => s + r.outboundCalls, 0),
      missedCalls: filtered.reduce((s, r) => s + r.missedCalls, 0),
      totalCallMinutes: filtered.reduce((s, r) => s + r.totalCallMinutes, 0),
      totalSms: filtered.reduce((s, r) => s + r.totalSms, 0),
      inboundSms: filtered.reduce((s, r) => s + r.inboundSms, 0),
      outboundSms: filtered.reduce((s, r) => s + r.outboundSms, 0),
      daysTracked: filtered.length,
    };
  },
});
