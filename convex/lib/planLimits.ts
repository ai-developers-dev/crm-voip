import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

type Plan = "free" | "starter" | "professional" | "enterprise";

interface PlanLimits {
  maxUsers: number;
  maxContacts: number;
  maxDailyCallMinutes: number;
  maxWorkflows: number;
  features: string[];
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxUsers: 1,
    maxContacts: 100,
    maxDailyCallMinutes: 60,
    maxWorkflows: 1,
    features: [],
  },
  starter: {
    maxUsers: 5,
    maxContacts: 1000,
    maxDailyCallMinutes: 500,
    maxWorkflows: 5,
    features: ["workflows", "sms"],
  },
  professional: {
    maxUsers: 25,
    maxContacts: 10000,
    maxDailyCallMinutes: -1, // unlimited
    maxWorkflows: -1,
    features: ["workflows", "sms", "ai_agents", "reports"],
  },
  enterprise: {
    maxUsers: -1, // unlimited
    maxContacts: -1,
    maxDailyCallMinutes: -1,
    maxWorkflows: -1,
    features: ["workflows", "sms", "ai_agents", "reports", "api_access"],
  },
};

/**
 * Get the plan limits for an organization.
 */
export async function getOrgPlanLimits(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">
): Promise<PlanLimits> {
  const org = await ctx.db.get(organizationId);
  if (!org) throw new Error("Organization not found");
  return PLAN_LIMITS[org.plan as Plan] ?? PLAN_LIMITS.free;
}

/**
 * Check if the org can add more users.
 */
export async function checkUserLimit(
  ctx: MutationCtx,
  organizationId: Id<"organizations">
): Promise<void> {
  const limits = await getOrgPlanLimits(ctx, organizationId);
  if (limits.maxUsers === -1) return; // unlimited

  const users = await ctx.db
    .query("users")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();

  if (users.length >= limits.maxUsers) {
    throw new Error(`User limit reached (${limits.maxUsers} users on ${(await ctx.db.get(organizationId))?.plan} plan). Upgrade to add more users.`);
  }
}

/**
 * Check if the org can add more contacts.
 */
export async function checkContactLimit(
  ctx: MutationCtx,
  organizationId: Id<"organizations">
): Promise<void> {
  const limits = await getOrgPlanLimits(ctx, organizationId);
  if (limits.maxContacts === -1) return;

  const contacts = await ctx.db
    .query("contacts")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();

  if (contacts.length >= limits.maxContacts) {
    throw new Error(`Contact limit reached (${limits.maxContacts} contacts on ${(await ctx.db.get(organizationId))?.plan} plan). Upgrade to add more contacts.`);
  }
}

/**
 * Check if a feature is available on the org's plan.
 */
export async function checkFeatureAccess(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  feature: string
): Promise<void> {
  const limits = await getOrgPlanLimits(ctx, organizationId);
  if (!limits.features.includes(feature)) {
    throw new Error(`Feature "${feature}" is not available on your current plan. Please upgrade.`);
  }
}
