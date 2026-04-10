import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authorizeOrgMember } from "./lib/auth";

// ============================================
// QUERIES
// ============================================

/**
 * Get the A2P brand registration for an organization
 */
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("a2pBrands")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .first();
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new A2P brand registration record
 */
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    customerProfileSid: v.optional(v.string()),
    trustProductSid: v.optional(v.string()),
    brandRegistrationSid: v.optional(v.string()),
    legalBusinessName: v.string(),
    ein: v.string(),
    businessType: v.string(),
    businessIndustry: v.string(),
    websiteUrl: v.optional(v.string()),
    businessAddress: v.object({
      street: v.string(),
      city: v.string(),
      state: v.string(),
      zip: v.string(),
      country: v.optional(v.string()),
    }),
    contactFirstName: v.string(),
    contactLastName: v.string(),
    contactEmail: v.string(),
    contactPhone: v.string(),
    contactTitle: v.optional(v.string()),
    status: v.string(),
    failureReason: v.optional(v.string()),
    vettingScore: v.optional(v.number()),
    vettingStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    const now = Date.now();
    return await ctx.db.insert("a2pBrands", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update an A2P brand registration (partial update for status changes, SID updates, etc.)
 */
export const update = mutation({
  args: {
    brandId: v.id("a2pBrands"),
    customerProfileSid: v.optional(v.string()),
    trustProductSid: v.optional(v.string()),
    brandRegistrationSid: v.optional(v.string()),
    status: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    vettingScore: v.optional(v.number()),
    vettingStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { brandId, ...updates } = args;
    const existing = await ctx.db.get(brandId);
    if (!existing) throw new Error("Brand registration not found");

    // Filter out undefined values
    const cleanUpdates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }

    await ctx.db.patch(brandId, cleanUpdates);
  },
});
