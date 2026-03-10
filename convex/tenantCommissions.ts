import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Queries

export const getSelectedCarriers = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tenantCarriers")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const getSelectedProducts = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tenantProducts")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const getCommissions = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tenantCommissions")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

// Single atomic mutation to save all business setup data
export const saveBusinessSetup = mutation({
  args: {
    clerkOrgId: v.string(),
    agencyTypeId: v.id("agencyTypes"),
    carrierIds: v.array(v.id("agencyCarriers")),
    productIds: v.array(v.id("agencyProducts")),
    commissions: v.array(
      v.object({
        carrierId: v.id("agencyCarriers"),
        productId: v.id("agencyProducts"),
        commissionRate: v.number(),
        renewalRate: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Find org
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();
    if (!org) throw new Error("Organization not found");

    // 1. Update org's agencyTypeId
    await ctx.db.patch(org._id, {
      agencyTypeId: args.agencyTypeId,
      updatedAt: Date.now(),
    });

    // 2. Delete existing tenant carriers
    const existingCarriers = await ctx.db
      .query("tenantCarriers")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();
    for (const tc of existingCarriers) {
      await ctx.db.delete(tc._id);
    }

    // 3. Delete existing tenant products
    const existingProducts = await ctx.db
      .query("tenantProducts")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();
    for (const tp of existingProducts) {
      await ctx.db.delete(tp._id);
    }

    // 4. Delete existing tenant commissions
    const existingCommissions = await ctx.db
      .query("tenantCommissions")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();
    for (const tc of existingCommissions) {
      await ctx.db.delete(tc._id);
    }

    const now = Date.now();

    // 5. Insert new carrier selections
    for (const carrierId of args.carrierIds) {
      await ctx.db.insert("tenantCarriers", {
        organizationId: org._id,
        agencyTypeId: args.agencyTypeId,
        carrierId,
        createdAt: now,
      });
    }

    // 6. Insert new product selections
    for (const productId of args.productIds) {
      await ctx.db.insert("tenantProducts", {
        organizationId: org._id,
        agencyTypeId: args.agencyTypeId,
        productId,
        createdAt: now,
      });
    }

    // 7. Insert new commission rates
    for (const comm of args.commissions) {
      await ctx.db.insert("tenantCommissions", {
        organizationId: org._id,
        agencyTypeId: args.agencyTypeId,
        carrierId: comm.carrierId,
        productId: comm.productId,
        commissionRate: comm.commissionRate,
        ...(comm.renewalRate !== undefined && { renewalRate: comm.renewalRate }),
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
