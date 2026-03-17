import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Update Stripe customer ID on an organization
export const updateStripeCustomer = mutation({
  args: {
    organizationId: v.id("organizations"),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    await ctx.db.patch(args.organizationId, {
      billing: {
        ...(org.billing || {
          basePlanPrice: 97,
          perUserPrice: 47,
          includedUsers: 1,
        }),
        stripeCustomerId: args.stripeCustomerId,
      },
      updatedAt: Date.now(),
    });
  },
});

// Update subscription status from Stripe webhook events
export const updateSubscription = mutation({
  args: {
    organizationId: v.id("organizations"),
    stripeSubscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("past_due"),
        v.literal("canceled"),
        v.literal("trialing"),
        v.literal("unpaid")
      )
    ),
    currentPeriodEnd: v.optional(v.number()),
    trialEndsAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    const billingPatch: Record<string, any> = {};
    if (args.stripeSubscriptionId) billingPatch.stripeSubscriptionId = args.stripeSubscriptionId;
    if (args.subscriptionStatus) billingPatch.subscriptionStatus = args.subscriptionStatus;
    if (args.currentPeriodEnd) billingPatch.currentPeriodEnd = args.currentPeriodEnd;
    if (args.trialEndsAt) billingPatch.trialEndsAt = args.trialEndsAt;

    await ctx.db.patch(args.organizationId, {
      billing: {
        ...(org.billing || {
          basePlanPrice: 97,
          perUserPrice: 47,
          includedUsers: 1,
        }),
        ...billingPatch,
      },
      updatedAt: Date.now(),
    });
  },
});

// Get billing summary for an organization
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) return null;
    return org.billing || null;
  },
});
