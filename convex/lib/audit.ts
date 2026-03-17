import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

interface AuditLogEntry {
  organizationId?: Id<"organizations">;
  action: string;
  entityType?: string;
  entityId?: string;
  changes?: any;
  metadata?: any;
}

/**
 * Write an audit log entry. Automatically captures the authenticated user.
 */
export async function writeAuditLog(
  ctx: MutationCtx,
  entry: AuditLogEntry
) {
  const identity = await ctx.auth.getUserIdentity();
  const clerkUserId = identity?.subject;
  const email = identity?.email ?? identity?.name ?? "unknown";

  // Try to determine role
  let userRole: string | undefined;
  if (clerkUserId) {
    const platformUser = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
      .first();
    if (platformUser) {
      userRole = platformUser.role;
    } else if (entry.organizationId) {
      const users = await ctx.db
        .query("users")
        .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
        .collect();
      const orgUser = users.find((u) => u.organizationId === entry.organizationId);
      if (orgUser) userRole = orgUser.role;
    }
  }

  await ctx.db.insert("auditLog", {
    organizationId: entry.organizationId,
    userId: clerkUserId,
    userEmail: email as string,
    userRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    changes: entry.changes,
    metadata: entry.metadata,
    timestamp: Date.now(),
  });
}
