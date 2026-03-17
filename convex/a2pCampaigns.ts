import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================
// QUERIES
// ============================================

/**
 * Get all A2P campaigns for an organization
 */
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("a2pCampaigns")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

/**
 * Get campaigns for a specific brand
 */
export const getByBrand = query({
  args: { brandId: v.id("a2pBrands") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("a2pCampaigns")
      .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
      .collect();
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new A2P campaign registration record
 */
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    brandId: v.id("a2pBrands"),
    messagingServiceSid: v.optional(v.string()),
    campaignSid: v.optional(v.string()),
    useCase: v.string(),
    description: v.string(),
    sampleMessages: v.array(v.string()),
    messageFlow: v.string(),
    helpMessage: v.string(),
    optInMessage: v.string(),
    optOutMessage: v.string(),
    hasEmbeddedLinks: v.boolean(),
    hasEmbeddedPhone: v.boolean(),
    isAgeGated: v.optional(v.boolean()),
    phoneNumberIds: v.optional(v.array(v.id("phoneNumbers"))),
    status: v.string(),
    failureReason: v.optional(v.string()),
    approvedThroughput: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("a2pCampaigns", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update an A2P campaign registration (partial update)
 */
export const update = mutation({
  args: {
    campaignId: v.id("a2pCampaigns"),
    messagingServiceSid: v.optional(v.string()),
    campaignSid: v.optional(v.string()),
    status: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    approvedThroughput: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { campaignId, ...updates } = args;
    const existing = await ctx.db.get(campaignId);
    if (!existing) throw new Error("Campaign registration not found");

    // Filter out undefined values
    const cleanUpdates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }

    await ctx.db.patch(campaignId, cleanUpdates);
  },
});
