import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

/** Get usage invoices for a tenant */
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("usageInvoices")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect()
      .then((invoices) => invoices.sort((a, b) => b.createdAt - a.createdAt));
  },
});

/** Get all invoices for a specific month (admin view) */
export const getAllForMonth = query({
  args: { year: v.number(), month: v.number() },
  handler: async (ctx, args) => {
    const invoices = await ctx.db
      .query("usageInvoices")
      .withIndex("by_month", (q) => q.eq("year", args.year).eq("month", args.month))
      .collect();

    // Enrich with org names
    const enriched = await Promise.all(
      invoices.map(async (inv) => {
        const org = await ctx.db.get(inv.organizationId);
        return { ...inv, orgName: org?.name || "Unknown" };
      })
    );
    return enriched.sort((a, b) => b.totalChargedCents - a.totalChargedCents);
  },
});

/** Get revenue summary across all tenants */
export const getRevenueSummary = query({
  args: { year: v.number(), month: v.number() },
  handler: async (ctx, args) => {
    const invoices = await ctx.db
      .query("usageInvoices")
      .withIndex("by_month", (q) => q.eq("year", args.year).eq("month", args.month))
      .collect();

    // Get all orgs for MRR calc
    const orgs = await ctx.db.query("organizations").collect();
    const activeOrgs = orgs.filter((o) => !o.isPlatformOrg && (o.billing as any)?.subscriptionStatus === "active");
    const trialingOrgs = orgs.filter((o) => !o.isPlatformOrg && (o.billing as any)?.subscriptionStatus === "trialing");
    const pastDueOrgs = orgs.filter((o) => !o.isPlatformOrg && (o.billing as any)?.subscriptionStatus === "past_due");

    // Calculate MRR from subscriptions
    let totalMrr = 0;
    for (const org of [...activeOrgs, ...trialingOrgs]) {
      const billing = org.billing as any;
      if (billing) {
        totalMrr += (billing.basePlanPrice || 0) * 100; // Convert to cents
      }
    }

    // Usage totals
    const totalUsageCost = invoices.reduce((sum, inv) => sum + inv.totalCostCents, 0);
    const totalUsageCharged = invoices.reduce((sum, inv) => sum + inv.totalChargedCents, 0);
    const totalProfit = invoices.reduce((sum, inv) => sum + inv.profitCents, 0);
    const paidCount = invoices.filter((inv) => inv.status === "paid").length;
    const failedCount = invoices.filter((inv) => inv.status === "failed").length;

    return {
      totalMrrCents: totalMrr,
      totalUsageCostCents: totalUsageCost,
      totalUsageChargedCents: totalUsageCharged,
      totalProfitCents: totalProfit,
      totalRevenueCents: totalMrr + totalUsageCharged,
      activeTenantsCount: activeOrgs.length,
      trialingTenantsCount: trialingOrgs.length,
      pastDueTenantsCount: pastDueOrgs.length,
      invoiceCount: invoices.length,
      paidCount,
      failedCount,
    };
  },
});

/** Create a usage invoice record */
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    month: v.number(),
    year: v.number(),
    twilioCallMinutes: v.number(),
    twilioSmsSent: v.number(),
    twilioCostCents: v.number(),
    twilioMarkupPercent: v.number(),
    retellCallCount: v.number(),
    retellCallMinutes: v.number(),
    retellCostCents: v.number(),
    retellMarkupPercent: v.number(),
    openaiConversations: v.number(),
    openaiTokensUsed: v.number(),
    openaiCostCents: v.number(),
    openaiMarkupPercent: v.number(),
  },
  handler: async (ctx, args) => {
    // Apply markups
    const twilioCharged = Math.ceil(args.twilioCostCents * (1 + args.twilioMarkupPercent / 100));
    const retellCharged = Math.ceil(args.retellCostCents * (1 + args.retellMarkupPercent / 100));
    const openaiCharged = Math.ceil(args.openaiCostCents * (1 + args.openaiMarkupPercent / 100));
    const totalCost = args.twilioCostCents + args.retellCostCents + args.openaiCostCents;
    const totalCharged = twilioCharged + retellCharged + openaiCharged;

    return await ctx.db.insert("usageInvoices", {
      organizationId: args.organizationId,
      month: args.month,
      year: args.year,
      twilioCallMinutes: args.twilioCallMinutes,
      twilioSmsSent: args.twilioSmsSent,
      twilioCostCents: args.twilioCostCents,
      twilioMarkupPercent: args.twilioMarkupPercent,
      twilioChargedCents: twilioCharged,
      retellCallCount: args.retellCallCount,
      retellCallMinutes: args.retellCallMinutes,
      retellCostCents: args.retellCostCents,
      retellMarkupPercent: args.retellMarkupPercent,
      retellChargedCents: retellCharged,
      openaiConversations: args.openaiConversations,
      openaiTokensUsed: args.openaiTokensUsed,
      openaiCostCents: args.openaiCostCents,
      openaiMarkupPercent: args.openaiMarkupPercent,
      openaiChargedCents: openaiCharged,
      totalCostCents: totalCost,
      totalChargedCents: totalCharged,
      profitCents: totalCharged - totalCost,
      status: "draft",
      createdAt: Date.now(),
    });
  },
});

/** Update invoice with Stripe invoice ID after sending */
export const updateStripeInfo = mutation({
  args: {
    invoiceId: v.id("usageInvoices"),
    stripeInvoiceId: v.string(),
    status: v.union(v.literal("sent"), v.literal("paid"), v.literal("failed"), v.literal("void")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.invoiceId, {
      stripeInvoiceId: args.stripeInvoiceId,
      stripePaymentStatus: args.status,
      status: args.status,
      ...(args.status === "paid" ? { paidAt: Date.now() } : {}),
    });
  },
});

/** Update invoice status from Stripe webhook */
export const updateStatusByStripeId = mutation({
  args: {
    stripeInvoiceId: v.string(),
    status: v.union(v.literal("paid"), v.literal("failed"), v.literal("void")),
  },
  handler: async (ctx, args) => {
    const invoices = await ctx.db.query("usageInvoices").collect();
    const invoice = invoices.find((inv) => inv.stripeInvoiceId === args.stripeInvoiceId);
    if (!invoice) return;

    await ctx.db.patch(invoice._id, {
      status: args.status,
      stripePaymentStatus: args.status,
      ...(args.status === "paid" ? { paidAt: Date.now() } : {}),
    });
  },
});

/** Get tenant billing summary (subscription + usage) */
export const getTenantBillingSummary = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) return null;

    const users = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const billing = org.billing as any;
    const basePlan = billing?.basePlanPrice || 0;
    const perUser = billing?.perUserPrice || 0;
    const includedUsers = billing?.includedUsers || 1;
    const additionalUsers = Math.max(0, users.length - includedUsers);
    const subscriptionTotal = basePlan + additionalUsers * perUser;

    // Get latest usage invoice
    const invoices = await ctx.db
      .query("usageInvoices")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const latestInvoice = invoices.sort((a, b) => b.createdAt - a.createdAt)[0];

    return {
      subscriptionStatus: billing?.subscriptionStatus || "none",
      basePlanPrice: basePlan,
      perUserPrice: perUser,
      includedUsers,
      totalUsers: users.length,
      additionalUsers,
      subscriptionTotalCents: subscriptionTotal * 100,
      latestUsageInvoice: latestInvoice || null,
      totalInvoices: invoices.length,
    };
  },
});
