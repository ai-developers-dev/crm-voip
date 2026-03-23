import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ── Pricing Plans ────────────────────────────────────────────────────

/** Get the active/default pricing plan (for public display) */
export const getActivePlan = query({
  handler: async (ctx) => {
    const plans = await ctx.db.query("pricingPlans").collect();
    return plans.find((p) => p.isActive && p.isDefault) || plans.find((p) => p.isActive) || null;
  },
});

/** Get all pricing plans */
export const getAllPlans = query({
  handler: async (ctx) => {
    const plans = await ctx.db.query("pricingPlans").collect();
    return plans.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Create or update the pricing plan */
export const upsertPlan = mutation({
  args: {
    id: v.optional(v.id("pricingPlans")),
    name: v.string(),
    description: v.optional(v.string()),
    basePriceMonthly: v.number(),
    perUserPrice: v.number(),
    includedUsers: v.number(),
    trialDays: v.number(),
    maxUsers: v.optional(v.number()),
    maxContacts: v.optional(v.number()),
    maxDailyCallMinutes: v.optional(v.number()),
    maxWorkflows: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error("Plan not found");
      await ctx.db.patch(args.id, {
        name: args.name,
        description: args.description,
        basePriceMonthly: args.basePriceMonthly,
        perUserPrice: args.perUserPrice,
        includedUsers: args.includedUsers,
        trialDays: args.trialDays,
        maxUsers: args.maxUsers,
        maxContacts: args.maxContacts,
        maxDailyCallMinutes: args.maxDailyCallMinutes,
        maxWorkflows: args.maxWorkflows,
        updatedAt: now,
      });
      return args.id;
    } else {
      return await ctx.db.insert("pricingPlans", {
        name: args.name,
        description: args.description,
        basePriceMonthly: args.basePriceMonthly,
        perUserPrice: args.perUserPrice,
        includedUsers: args.includedUsers,
        trialDays: args.trialDays,
        isActive: true,
        isDefault: true,
        maxUsers: args.maxUsers,
        maxContacts: args.maxContacts,
        maxDailyCallMinutes: args.maxDailyCallMinutes,
        maxWorkflows: args.maxWorkflows,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/** Save Stripe IDs on a plan after sync */
export const updatePlanStripeIds = mutation({
  args: {
    planId: v.id("pricingPlans"),
    stripeProductId: v.string(),
    stripeBasePriceId: v.string(),
    stripePerUserPriceId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.planId, {
      stripeProductId: args.stripeProductId,
      stripeBasePriceId: args.stripeBasePriceId,
      stripePerUserPriceId: args.stripePerUserPriceId,
      updatedAt: Date.now(),
    });
  },
});

// ── Pricing Add-Ons ──────────────────────────────────────────────────

/** Get all active add-ons (for public display) */
export const getActiveAddons = query({
  handler: async (ctx) => {
    const addons = await ctx.db.query("pricingAddons").collect();
    return addons.filter((a) => a.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Get all add-ons (including inactive, for admin) */
export const getAllAddons = query({
  handler: async (ctx) => {
    const addons = await ctx.db.query("pricingAddons").collect();
    return addons.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Create a new add-on */
export const createAddon = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    priceMonthly: v.number(),
    category: v.string(),
    icon: v.optional(v.string()),
    featureKey: v.string(),
    isIncludedInBase: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("pricingAddons").collect();
    const now = Date.now();
    return await ctx.db.insert("pricingAddons", {
      ...args,
      isActive: true,
      sortOrder: existing.length,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Update an add-on */
export const updateAddon = mutation({
  args: {
    id: v.id("pricingAddons"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    priceMonthly: v.optional(v.number()),
    category: v.optional(v.string()),
    icon: v.optional(v.string()),
    featureKey: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    isIncludedInBase: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const patch: Record<string, any> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patch[key] = value;
    }
    await ctx.db.patch(id, patch);
  },
});

/** Delete an add-on */
export const removeAddon = mutation({
  args: { id: v.id("pricingAddons") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

/** Save Stripe IDs on an add-on after sync */
export const updateAddonStripeIds = mutation({
  args: {
    addonId: v.id("pricingAddons"),
    stripeProductId: v.string(),
    stripePriceId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.addonId, {
      stripeProductId: args.stripeProductId,
      stripePriceId: args.stripePriceId,
      updatedAt: Date.now(),
    });
  },
});

/** Seed default add-ons (run once from admin UI) */
export const seedDefaultAddons = mutation({
  handler: async (ctx) => {
    const existing = await ctx.db.query("pricingAddons").collect();
    if (existing.length > 0) return; // Already seeded

    const now = Date.now();
    const defaults = [
      { name: "Calls", featureKey: "calls", category: "communication", icon: "Phone", priceMonthly: 29, isIncludedInBase: false },
      { name: "SMS", featureKey: "sms", category: "communication", icon: "MessageSquare", priceMonthly: 19, isIncludedInBase: false },
      { name: "Contacts", featureKey: "contacts", category: "productivity", icon: "Users", priceMonthly: 0, isIncludedInBase: true },
      { name: "Calendar", featureKey: "calendar", category: "productivity", icon: "Calendar", priceMonthly: 0, isIncludedInBase: true },
      { name: "Reports", featureKey: "reports", category: "productivity", icon: "BarChart3", priceMonthly: 9, isIncludedInBase: false },
      { name: "Workflows", featureKey: "workflows", category: "productivity", icon: "Workflow", priceMonthly: 19, isIncludedInBase: false },
      { name: "Pipelines", featureKey: "pipelines", category: "productivity", icon: "Columns3", priceMonthly: 0, isIncludedInBase: true },
      { name: "AI Voice Agents", featureKey: "ai_calling", category: "ai", icon: "Phone", priceMonthly: 49, isIncludedInBase: false },
      { name: "AI SMS Agents", featureKey: "ai_sms", category: "ai", icon: "BrainCircuit", priceMonthly: 29, isIncludedInBase: false },
    ];

    for (let i = 0; i < defaults.length; i++) {
      await ctx.db.insert("pricingAddons", {
        ...defaults[i],
        isActive: true,
        sortOrder: i,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
