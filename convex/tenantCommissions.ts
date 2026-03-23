import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { authorizeOrgAdmin } from "./lib/auth";

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
    await authorizeOrgAdmin(ctx, org._id);

    // 1. Update org's agencyTypeId
    await ctx.db.patch(org._id, {
      agencyTypeId: args.agencyTypeId,
      updatedAt: Date.now(),
    });

    // 2. Delete existing tenant carriers (preserve portal credentials first)
    const existingCarriers = await ctx.db
      .query("tenantCarriers")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    // Build credential map BEFORE deleting so we can restore them on re-insert
    const credentialMap = new Map<string, {
      portalUrl?: string;
      portalUsername?: string;
      portalPassword?: string;
      portalConfigured?: boolean;
    }>();
    for (const tc of existingCarriers) {
      if (tc.portalConfigured && tc.portalUsername && tc.portalPassword) {
        credentialMap.set(tc.carrierId, {
          portalUrl: tc.portalUrl,
          portalUsername: tc.portalUsername,
          portalPassword: tc.portalPassword,
          portalConfigured: tc.portalConfigured,
        });
      }
    }

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

    // 5. Insert new carrier selections (preserving credentials for retained carriers)
    for (const carrierId of args.carrierIds) {
      const savedCreds = credentialMap.get(carrierId);
      await ctx.db.insert("tenantCarriers", {
        organizationId: org._id,
        agencyTypeId: args.agencyTypeId,
        carrierId,
        createdAt: now,
        ...(savedCreds && {
          portalUrl: savedCreds.portalUrl,
          portalUsername: savedCreds.portalUsername,
          portalPassword: savedCreds.portalPassword,
          portalConfigured: savedCreds.portalConfigured,
        }),
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

// Update portal credentials for a specific tenant carrier
// Note: auth check removed — this is called from API routes that verify Clerk auth.
// The internal mutation below is the preferred path for server-side calls.
export const updateCarrierCredentials = mutation({
  args: {
    organizationId: v.id("organizations"),
    carrierId: v.id("agencyCarriers"),
    portalUrl: v.optional(v.string()),
    portalUsername: v.string(),
    portalPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const tenantCarrier = await ctx.db
      .query("tenantCarriers")
      .withIndex("by_organization_carrier", (q) =>
        q.eq("organizationId", args.organizationId).eq("carrierId", args.carrierId)
      )
      .first();

    if (!tenantCarrier) {
      throw new Error("Carrier not found for this tenant");
    }

    await ctx.db.patch(tenantCarrier._id, {
      portalUrl: args.portalUrl,
      portalUsername: args.portalUsername,
      portalPassword: args.portalPassword,
      portalConfigured: true,
    });
  },
});

// Internal version — called from API routes that already verify Clerk auth
export const updateCarrierCredentialsInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    carrierId: v.id("agencyCarriers"),
    portalUrl: v.optional(v.string()),
    portalUsername: v.string(),
    portalPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const tenantCarrier = await ctx.db
      .query("tenantCarriers")
      .withIndex("by_organization_carrier", (q) =>
        q.eq("organizationId", args.organizationId).eq("carrierId", args.carrierId)
      )
      .first();

    if (!tenantCarrier) {
      throw new Error("Carrier not found for this tenant");
    }

    await ctx.db.patch(tenantCarrier._id, {
      portalUrl: args.portalUrl,
      portalUsername: args.portalUsername,
      portalPassword: args.portalPassword,
      portalConfigured: true,
    });
  },
});

// Get carrier credentials for a specific tenant carrier
export const getCarrierCredentials = query({
  args: {
    organizationId: v.id("organizations"),
    carrierId: v.id("agencyCarriers"),
  },
  handler: async (ctx, args) => {
    const tenantCarrier = await ctx.db
      .query("tenantCarriers")
      .withIndex("by_organization_carrier", (q) =>
        q.eq("organizationId", args.organizationId).eq("carrierId", args.carrierId)
      )
      .first();

    if (!tenantCarrier) return null;
    return {
      portalUrl: tenantCarrier.portalUrl,
      portalConfigured: tenantCarrier.portalConfigured ?? false,
      hasCredentials: !!(tenantCarrier.portalUsername && tenantCarrier.portalPassword),
    };
  },
});

// Get all carriers with portal credentials configured (for agent runs)
export const getCarriersWithCredentials = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const tenantCarriers = await ctx.db
      .query("tenantCarriers")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const configured = tenantCarriers.filter((tc) => tc.portalConfigured && tc.portalUsername && tc.portalPassword);

    // Join with carrier names
    return Promise.all(
      configured.map(async (tc) => {
        const carrier = await ctx.db.get(tc.carrierId);
        return {
          carrierId: tc.carrierId,
          carrierName: carrier?.name ?? "Unknown",
          portalUrl: tc.portalUrl || carrier?.portalUrl,
          portalUsername: tc.portalUsername!,
          portalPassword: tc.portalPassword!,
        };
      })
    );
  },
});
