import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Shared authorization helpers for Convex mutations and queries.
 * Use these to verify the caller has permission before modifying data.
 */

type Ctx = QueryCtx | MutationCtx;

/**
 * Get the authenticated Clerk user ID from the context.
 * Throws if not authenticated.
 */
export async function requireAuth(ctx: Ctx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity.subject; // Clerk user ID (e.g., "user_xxxx")
}

/**
 * Verify the caller is a member of the given organization.
 * Returns the user record. Throws if not a member.
 */
export async function authorizeOrgMember(
  ctx: Ctx,
  organizationId: Id<"organizations">
) {
  const clerkUserId = await requireAuth(ctx);

  // Check tenant-level user
  const users = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .collect();

  const user = users.find((u) => u.organizationId === organizationId);
  if (user) return user;

  // Also allow platform admins to access any org
  const platformUser = await ctx.db
    .query("platformUsers")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();

  if (platformUser?.isActive) return platformUser;

  throw new Error("Not authorized to access this organization");
}

/**
 * Verify the caller is an admin of the given organization (tenant_admin+).
 * Also allows platform admins. Returns the user record.
 */
export async function authorizeOrgAdmin(
  ctx: Ctx,
  organizationId: Id<"organizations">
) {
  const clerkUserId = await requireAuth(ctx);

  // Check platform admin first (they can admin any org)
  const platformUser = await ctx.db
    .query("platformUsers")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();

  if (platformUser?.isActive) return platformUser;

  // Check tenant-level admin
  const users = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .collect();

  const user = users.find((u) => u.organizationId === organizationId);
  if (user && user.role === "tenant_admin") return user;

  throw new Error("Not authorized as organization admin");
}

/**
 * Verify the caller is a platform admin (super_admin or platform_staff).
 * Returns the platform user record.
 */
export async function authorizePlatformAdmin(ctx: Ctx) {
  const clerkUserId = await requireAuth(ctx);

  const platformUser = await ctx.db
    .query("platformUsers")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();

  if (!platformUser?.isActive) {
    throw new Error("Not authorized as platform admin");
  }

  return platformUser;
}

/**
 * Verify the caller is specifically a super_admin (not just platform_staff).
 */
export async function authorizeSuperAdmin(ctx: Ctx) {
  const platformUser = await authorizePlatformAdmin(ctx);

  if (platformUser.role !== "super_admin") {
    throw new Error("Not authorized — super admin required");
  }

  return platformUser;
}

/**
 * Verify the caller is at least a supervisor in the given organization.
 * Allows: tenant_admin, supervisor, platform admins.
 */
export async function authorizeOrgSupervisor(
  ctx: Ctx,
  organizationId: Id<"organizations">
) {
  const clerkUserId = await requireAuth(ctx);

  // Platform admins can do anything
  const platformUser = await ctx.db
    .query("platformUsers")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();

  if (platformUser?.isActive) return platformUser;

  // Check tenant user with supervisor+ role
  const users = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .collect();

  const user = users.find((u) => u.organizationId === organizationId);
  if (user && (user.role === "tenant_admin" || user.role === "supervisor")) {
    return user;
  }

  throw new Error("Not authorized — supervisor or admin required");
}
