import { v } from "convex/values";
import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/** Individual sales list for a date range — used by drill-down dialogs */
export const getSalesList = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const allSales = await ctx.db
      .query("sales")
      .withIndex("by_organization_date", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("effectiveDate", args.startDate)
      )
      .collect();

    const sales = allSales.filter(
      (s) => s.effectiveDate <= args.endDate && s.status !== "cancelled"
    );

    if (sales.length === 0) return [];

    // Batch-fetch related data
    const carrierIds = new Set<Id<"agencyCarriers">>();
    const userIds = new Set<Id<"users">>();
    const contactIds = new Set<Id<"contacts">>();

    for (const sale of sales) {
      carrierIds.add(sale.carrierId);
      userIds.add(sale.userId);
      contactIds.add(sale.contactId);
    }

    const [carrierDocs, userDocs, contactDocs, lineItemsBySale] = await Promise.all([
      Promise.all([...carrierIds].map((id) => ctx.db.get(id))),
      Promise.all([...userIds].map((id) => ctx.db.get(id))),
      Promise.all([...contactIds].map((id) => ctx.db.get(id))),
      Promise.all(
        sales.map((sale) =>
          ctx.db
            .query("saleLineItems")
            .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
            .collect()
        )
      ),
    ]);

    const carrierNames = new Map<string, string>();
    for (const doc of carrierDocs) if (doc) carrierNames.set(doc._id, doc.name);
    const userNames = new Map<string, string>();
    for (const doc of userDocs) if (doc) userNames.set(doc._id, doc.name);
    const contactNames = new Map<string, string>();
    for (const doc of contactDocs) {
      if (doc) contactNames.set(doc._id, `${doc.firstName} ${doc.lastName}`);
    }

    return sales
      .map((sale, i) => ({
        _id: sale._id,
        policyNumber: sale.policyNumber ?? "",
        effectiveDate: sale.effectiveDate,
        totalPremium: sale.totalPremium,
        status: sale.status,
        carrierName: carrierNames.get(sale.carrierId) ?? "Unknown",
        userName: userNames.get(sale.userId) ?? "Unknown",
        contactName: contactNames.get(sale.contactId) ?? "Unknown",
        policyCount: lineItemsBySale[i].length,
      }))
      .sort((a, b) => b.effectiveDate - a.effectiveDate);
  },
});

/** Aggregated sales report for an organization within a date range */
export const getSalesReport = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    // Fetch sales in date range using composite index
    const allSales = await ctx.db
      .query("sales")
      .withIndex("by_organization_date", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("effectiveDate", args.startDate)
      )
      .collect();

    // Filter by end date and exclude cancelled
    const sales = allSales.filter(
      (s) => s.effectiveDate <= args.endDate && s.status !== "cancelled"
    );

    if (sales.length === 0) {
      return {
        summary: { totalSales: 0, totalPremium: 0, avgPremium: 0, totalPolicies: 0 },
        byCarrier: [],
        byProduct: [],
        byUser: [],
      };
    }

    // Batch-fetch all line items for matched sales
    const lineItemsBysale = await Promise.all(
      sales.map((sale) =>
        ctx.db
          .query("saleLineItems")
          .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
          .collect()
      )
    );

    // Collect unique IDs for batch name lookups
    const carrierIds = new Set<Id<"agencyCarriers">>();
    const userIds = new Set<Id<"users">>();
    const productIds = new Set<Id<"agencyProducts">>();

    for (const sale of sales) {
      carrierIds.add(sale.carrierId);
      userIds.add(sale.userId);
    }
    for (const items of lineItemsBysale) {
      for (const item of items) {
        productIds.add(item.productId);
      }
    }

    // Batch-fetch names
    const [carrierDocs, userDocs, productDocs] = await Promise.all([
      Promise.all([...carrierIds].map((id) => ctx.db.get(id))),
      Promise.all([...userIds].map((id) => ctx.db.get(id))),
      Promise.all([...productIds].map((id) => ctx.db.get(id))),
    ]);

    const carrierNames = new Map<string, string>();
    for (const doc of carrierDocs) {
      if (doc) carrierNames.set(doc._id, doc.name);
    }
    const userNames = new Map<string, string>();
    for (const doc of userDocs) {
      if (doc) userNames.set(doc._id, doc.name);
    }
    const productNames = new Map<string, string>();
    for (const doc of productDocs) {
      if (doc) productNames.set(doc._id, doc.name);
    }

    // Aggregate summary
    const totalPremium = sales.reduce((sum, s) => sum + s.totalPremium, 0);
    const totalPolicies = lineItemsBysale.reduce((sum, items) => sum + items.length, 0);
    const summary = {
      totalSales: sales.length,
      totalPremium,
      avgPremium: sales.length > 0 ? totalPremium / sales.length : 0,
      totalPolicies,
    };

    // Aggregate by carrier
    const carrierMap = new Map<string, { salesCount: number; totalPremium: number; policyCount: number }>();
    for (let i = 0; i < sales.length; i++) {
      const sale = sales[i];
      const key = sale.carrierId;
      const existing = carrierMap.get(key) ?? { salesCount: 0, totalPremium: 0, policyCount: 0 };
      existing.salesCount += 1;
      existing.totalPremium += sale.totalPremium;
      existing.policyCount += lineItemsBysale[i].length;
      carrierMap.set(key, existing);
    }
    const byCarrier = [...carrierMap.entries()]
      .map(([carrierId, data]) => ({
        carrierId,
        carrierName: carrierNames.get(carrierId) ?? "Unknown",
        ...data,
      }))
      .sort((a, b) => b.totalPremium - a.totalPremium);

    // Aggregate by product (LOB) — from line items
    const productMap = new Map<string, { salesCount: number; totalPremium: number }>();
    for (let i = 0; i < sales.length; i++) {
      const items = lineItemsBysale[i];
      const seenProducts = new Set<string>();
      for (const item of items) {
        const key = item.productId;
        const existing = productMap.get(key) ?? { salesCount: 0, totalPremium: 0 };
        existing.totalPremium += item.premium;
        if (!seenProducts.has(key)) {
          existing.salesCount += 1;
          seenProducts.add(key);
        }
        productMap.set(key, existing);
      }
    }
    const byProduct = [...productMap.entries()]
      .map(([productId, data]) => ({
        productId,
        productName: productNames.get(productId) ?? "Unknown",
        ...data,
      }))
      .sort((a, b) => b.totalPremium - a.totalPremium);

    // Aggregate by user
    const userMap = new Map<string, { salesCount: number; totalPremium: number; policyCount: number }>();
    for (let i = 0; i < sales.length; i++) {
      const sale = sales[i];
      const key = sale.userId;
      const existing = userMap.get(key) ?? { salesCount: 0, totalPremium: 0, policyCount: 0 };
      existing.salesCount += 1;
      existing.totalPremium += sale.totalPremium;
      existing.policyCount += lineItemsBysale[i].length;
      userMap.set(key, existing);
    }
    const byUser = [...userMap.entries()]
      .map(([userId, data]) => ({
        userId,
        userName: userNames.get(userId) ?? "Unknown",
        ...data,
      }))
      .sort((a, b) => b.totalPremium - a.totalPremium);

    return { summary, byCarrier, byProduct, byUser };
  },
});

/** Estimated commissions report — joins sales line items with commission rates */
export const getCommissionReport = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    // Fetch sales in date range
    const allSales = await ctx.db
      .query("sales")
      .withIndex("by_organization_date", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("effectiveDate", args.startDate)
      )
      .collect();

    const sales = allSales.filter(
      (s) => s.effectiveDate <= args.endDate && s.status !== "cancelled"
    );

    if (sales.length === 0) {
      return {
        totalPremium: 0,
        totalEstimatedCommission: 0,
        totalEstimatedRenewal: 0,
        byCarrier: [],
        byProduct: [],
        byUser: [],
      };
    }

    // Batch-fetch line items
    const lineItemsBySale = await Promise.all(
      sales.map((sale) =>
        ctx.db
          .query("saleLineItems")
          .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
          .collect()
      )
    );

    // Collect unique IDs
    const carrierIds = new Set<Id<"agencyCarriers">>();
    const userIds = new Set<Id<"users">>();
    const productIds = new Set<Id<"agencyProducts">>();

    for (const sale of sales) {
      carrierIds.add(sale.carrierId);
      userIds.add(sale.userId);
    }
    for (const items of lineItemsBySale) {
      for (const item of items) {
        productIds.add(item.productId);
      }
    }

    // Batch-fetch names + tenant commission rates (with platform defaults as fallback)
    const [carrierDocs, userDocs, productDocs, tenantCommissions, platformCommissions] = await Promise.all([
      Promise.all([...carrierIds].map((id) => ctx.db.get(id))),
      Promise.all([...userIds].map((id) => ctx.db.get(id))),
      Promise.all([...productIds].map((id) => ctx.db.get(id))),
      // Tenant-level rates (primary)
      ctx.db
        .query("tenantCommissions")
        .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
        .collect(),
      // Platform-level rates (fallback)
      Promise.all(
        [...carrierIds].map((cid) =>
          ctx.db
            .query("carrierCommissions")
            .withIndex("by_carrier", (q) => q.eq("carrierId", cid))
            .collect()
        )
      ),
    ]);

    // Build lookup maps
    const carrierNames = new Map<string, string>();
    for (const doc of carrierDocs) if (doc) carrierNames.set(doc._id, doc.name);
    const userNames = new Map<string, string>();
    const userCommSplits = new Map<string, number>();
    const userRenewalSplits = new Map<string, number>();
    for (const doc of userDocs) {
      if (doc) {
        userNames.set(doc._id, doc.name);
        if (doc.agentCommissionSplit != null) {
          userCommSplits.set(doc._id, doc.agentCommissionSplit);
        }
        if (doc.agentRenewalSplit != null) {
          userRenewalSplits.set(doc._id, doc.agentRenewalSplit);
        }
      }
    }
    const productNames = new Map<string, string>();
    for (const doc of productDocs) if (doc) productNames.set(doc._id, doc.name);

    // Commission rate lookup: "carrierId|productId" → { commissionRate, renewalRate }
    // Start with platform defaults, then override with tenant-specific rates
    const commissionRates = new Map<string, { commissionRate: number; renewalRate: number }>();
    for (const commList of platformCommissions) {
      for (const comm of commList) {
        commissionRates.set(`${comm.carrierId}|${comm.productId}`, {
          commissionRate: comm.commissionRate,
          renewalRate: comm.renewalRate,
        });
      }
    }
    // Tenant rates take priority
    for (const comm of tenantCommissions) {
      commissionRates.set(`${comm.carrierId}|${comm.productId}`, {
        commissionRate: comm.commissionRate,
        renewalRate: comm.renewalRate ?? 0,
      });
    }

    // Aggregate
    let totalPremium = 0;
    let totalEstimatedCommission = 0;
    let totalEstimatedRenewal = 0;

    const carrierAgg = new Map<string, { premium: number; commission: number; renewal: number; policies: number }>();
    const productAgg = new Map<string, { premium: number; commission: number; renewal: number; policies: number }>();
    const userAgg = new Map<string, { premium: number; commission: number; renewal: number; policies: number; agentCommission: number; agentRenewal: number }>();

    for (let i = 0; i < sales.length; i++) {
      const sale = sales[i];
      const items = lineItemsBySale[i];

      for (const item of items) {
        const rateKey = `${sale.carrierId}|${item.productId}`;
        const rates = commissionRates.get(rateKey);
        const commRate = rates?.commissionRate ?? 0;
        const renRate = rates?.renewalRate ?? 0;
        const commission = item.premium * (commRate / 100);
        const renewal = item.premium * (renRate / 100);

        totalPremium += item.premium;
        totalEstimatedCommission += commission;
        totalEstimatedRenewal += renewal;

        // By carrier
        const ce = carrierAgg.get(sale.carrierId) ?? { premium: 0, commission: 0, renewal: 0, policies: 0 };
        ce.premium += item.premium;
        ce.commission += commission;
        ce.renewal += renewal;
        ce.policies += 1;
        carrierAgg.set(sale.carrierId, ce);

        // By product
        const pe = productAgg.get(item.productId) ?? { premium: 0, commission: 0, renewal: 0, policies: 0 };
        pe.premium += item.premium;
        pe.commission += commission;
        pe.renewal += renewal;
        pe.policies += 1;
        productAgg.set(item.productId, pe);

        // By user
        const ue = userAgg.get(sale.userId) ?? { premium: 0, commission: 0, renewal: 0, policies: 0, agentCommission: 0, agentRenewal: 0 };
        ue.premium += item.premium;
        ue.commission += commission;
        ue.renewal += renewal;
        ue.policies += 1;
        const commSplitPct = userCommSplits.get(sale.userId) ?? 0;
        const renewalSplitPct = userRenewalSplits.get(sale.userId) ?? 0;
        ue.agentCommission += commission * (commSplitPct / 100);
        ue.agentRenewal += renewal * (renewalSplitPct / 100);
        userAgg.set(sale.userId, ue);
      }
    }

    const byCarrier = [...carrierAgg.entries()]
      .map(([id, d]) => ({ id, name: carrierNames.get(id) ?? "Unknown", ...d }))
      .sort((a, b) => b.commission - a.commission);

    const byProduct = [...productAgg.entries()]
      .map(([id, d]) => ({ id, name: productNames.get(id) ?? "Unknown", ...d }))
      .sort((a, b) => b.commission - a.commission);

    const byUser = [...userAgg.entries()]
      .map(([id, d]) => ({
        id,
        name: userNames.get(id) ?? "Unknown",
        splitPct: userCommSplits.get(id) ?? 0,
        renewalSplitPct: userRenewalSplits.get(id) ?? 0,
        ...d,
      }))
      .sort((a, b) => b.commission - a.commission);

    return { totalPremium, totalEstimatedCommission, totalEstimatedRenewal, byCarrier, byProduct, byUser };
  },
});
