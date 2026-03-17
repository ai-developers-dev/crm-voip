import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { authorizeOrgMember } from "./lib/auth";

// ─── Queries ──────────────────────────────────────────────

/** Get tenant's configured carriers with their names */
export const getCarriersWithNames = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const tenantCarriers = await ctx.db
      .query("tenantCarriers")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const carriers = await Promise.all(
      tenantCarriers.map(async (tc) => {
        const carrier = await ctx.db.get(tc.carrierId);
        if (!carrier || !carrier.isActive) return null;
        return { carrierId: carrier._id, name: carrier.name };
      })
    );

    return carriers.filter(Boolean) as { carrierId: typeof tenantCarriers[0]["carrierId"]; name: string }[];
  },
});

/** Get tenant's configured products/LOBs for a specific carrier */
export const getProductsByCarrier = query({
  args: {
    organizationId: v.id("organizations"),
    carrierId: v.id("agencyCarriers"),
  },
  handler: async (ctx, args) => {
    const tenantProducts = await ctx.db
      .query("tenantProducts")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const products = await Promise.all(
      tenantProducts.map(async (tp) => {
        const product = await ctx.db.get(tp.productId);
        if (!product || !product.isActive || product.carrierId !== args.carrierId) return null;
        return { productId: product._id, name: product.name, coverageFields: product.coverageFields };
      })
    );

    return products.filter(Boolean) as { productId: typeof tenantProducts[0]["productId"]; name: string; coverageFields?: { key: string; label: string; placeholder?: string }[] }[];
  },
});

/** Get sales for a specific contact */
export const getByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();

    // Sort by effectiveDate descending
    sales.sort((a, b) => b.effectiveDate - a.effectiveDate);

    // Join carrier names, line items, sale type, and user
    const enriched = await Promise.all(
      sales.map(async (sale) => {
        const [carrier, lineItems, saleType, user] = await Promise.all([
          ctx.db.get(sale.carrierId),
          ctx.db
            .query("saleLineItems")
            .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
            .collect(),
          sale.saleTypeId ? ctx.db.get(sale.saleTypeId) : null,
          ctx.db.get(sale.userId),
        ]);

        const enrichedItems = await Promise.all(
          lineItems.map(async (item) => {
            const product = await ctx.db.get(item.productId);
            return { ...item, productName: product?.name ?? "Unknown", coverageFields: product?.coverageFields };
          })
        );

        return {
          ...sale,
          carrierName: carrier?.name ?? "Unknown",
          carrierUrl: carrier?.portalUrl ?? carrier?.websiteUrl ?? undefined,
          saleTypeName: saleType?.name ?? undefined,
          userName: user?.name ?? "Unknown",
          lineItems: enrichedItems,
        };
      })
    );

    return enriched;
  },
});

/** Get sales for an organization (for reporting) */
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    sales.sort((a, b) => b.effectiveDate - a.effectiveDate);

    const enriched = await Promise.all(
      sales.map(async (sale) => {
        const [carrier, contact, user] = await Promise.all([
          ctx.db.get(sale.carrierId),
          ctx.db.get(sale.contactId),
          ctx.db.get(sale.userId),
        ]);
        return {
          ...sale,
          carrierName: carrier?.name ?? "Unknown",
          contactName: contact ? `${contact.firstName} ${contact.lastName}` : "Unknown",
          userName: user?.name ?? "Unknown",
        };
      })
    );

    return enriched;
  },
});

/** Get sales for a specific user (for reporting) */
export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    sales.sort((a, b) => b.effectiveDate - a.effectiveDate);
    return sales;
  },
});

// ─── Mutations ────────────────────────────────────────────

/** Create a new sale with line items */
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    userId: v.id("users"),
    carrierId: v.id("agencyCarriers"),
    saleTypeId: v.optional(v.id("saleTypes")),
    policyNumber: v.optional(v.string()),
    effectiveDate: v.number(),
    term: v.number(),
    notes: v.optional(v.string()),
    coverages: v.optional(v.any()),
    lineItems: v.array(
      v.object({
        productId: v.id("agencyProducts"),
        premium: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    // Calculate end date using UTC to avoid timezone issues
    const eff = new Date(args.effectiveDate);
    const endDate = Date.UTC(
      eff.getUTCFullYear(),
      eff.getUTCMonth() + args.term,
      eff.getUTCDate(),
      12, 0, 0 // UTC noon so any timezone displays the correct day
    );

    // Calculate total premium
    const totalPremium = args.lineItems.reduce((sum, item) => sum + item.premium, 0);

    const now = Date.now();

    // Insert sale
    const saleId = await ctx.db.insert("sales", {
      organizationId: args.organizationId,
      contactId: args.contactId,
      userId: args.userId,
      carrierId: args.carrierId,
      saleTypeId: args.saleTypeId,
      policyNumber: args.policyNumber,
      effectiveDate: args.effectiveDate,
      endDate,
      term: args.term,
      totalPremium,
      status: "active",
      notes: args.notes,
      coverages: args.coverages,
      createdAt: now,
      updatedAt: now,
    });

    // Insert line items
    for (const item of args.lineItems) {
      await ctx.db.insert("saleLineItems", {
        saleId,
        organizationId: args.organizationId,
        productId: item.productId,
        premium: item.premium,
        createdAt: now,
      });
    }

    return saleId;
  },
});

/** Update sale status */
export const updateStatus = mutation({
  args: {
    id: v.id("sales"),
    status: v.union(
      v.literal("active"),
      v.literal("cancelled"),
      v.literal("pending")
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Sale not found");
    await authorizeOrgMember(ctx, existing.organizationId);
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/** Update sale with all fields including line items */
export const update = mutation({
  args: {
    id: v.id("sales"),
    carrierId: v.id("agencyCarriers"),
    saleTypeId: v.optional(v.id("saleTypes")),
    policyNumber: v.optional(v.string()),
    effectiveDate: v.number(),
    term: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("cancelled"),
      v.literal("pending")
    ),
    notes: v.optional(v.string()),
    coverages: v.optional(v.any()),
    lineItems: v.array(
      v.object({
        productId: v.id("agencyProducts"),
        premium: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Sale not found");
    await authorizeOrgMember(ctx, existing.organizationId);

    // Recalculate end date using UTC to avoid timezone issues
    const eff = new Date(args.effectiveDate);
    const endDate = Date.UTC(
      eff.getUTCFullYear(),
      eff.getUTCMonth() + args.term,
      eff.getUTCDate(),
      12, 0, 0 // UTC noon so any timezone displays the correct day
    );
    const totalPremium = args.lineItems.reduce((sum, item) => sum + item.premium, 0);

    const now = Date.now();

    // Update the sale record
    await ctx.db.patch(args.id, {
      carrierId: args.carrierId,
      saleTypeId: args.saleTypeId,
      policyNumber: args.policyNumber,
      effectiveDate: args.effectiveDate,
      endDate,
      term: args.term,
      totalPremium,
      status: args.status,
      notes: args.notes,
      coverages: args.coverages,
      updatedAt: now,
    });

    // Delete existing line items and re-create
    const oldItems = await ctx.db
      .query("saleLineItems")
      .withIndex("by_sale", (q) => q.eq("saleId", args.id))
      .collect();
    await Promise.all(oldItems.map((item) => ctx.db.delete(item._id)));

    for (const item of args.lineItems) {
      await ctx.db.insert("saleLineItems", {
        saleId: args.id,
        organizationId: existing.organizationId,
        productId: item.productId,
        premium: item.premium,
        createdAt: now,
      });
    }
  },
});

/** Delete a sale and its line items */
export const remove = mutation({
  args: { id: v.id("sales") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Sale not found");
    await authorizeOrgMember(ctx, existing.organizationId);
    const lineItems = await ctx.db
      .query("saleLineItems")
      .withIndex("by_sale", (q) => q.eq("saleId", args.id))
      .collect();
    await Promise.all(lineItems.map((item) => ctx.db.delete(item._id)));
    await ctx.db.delete(args.id);
  },
});
