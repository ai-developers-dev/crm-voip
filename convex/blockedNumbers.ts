import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { authorizeOrgMember } from "./lib/auth";

/**
 * Blocked-number registry.
 *
 * Twilio has no built-in inbound block list — the recommended pattern
 * (https://www.twilio.com/docs/voice/tutorials/how-to-block-callers)
 * is to consult your own list inside the voice webhook and respond
 * with `<Reject reason="busy">` so Twilio drops the call before
 * anything billable happens. SMS is handled the same way: respond
 * with empty TwiML so no message is delivered.
 *
 * Numbers are stored in E.164 form so a single `by_org_phone` index
 * lookup gets us O(1) "is this caller blocked?" — used on the voice
 * webhook critical path (target < 200 ms).
 */

// Lookup: is `phoneNumber` (E.164) blocked for this org?
export const isBlocked = query({
  args: {
    organizationId: v.id("organizations"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("blockedNumbers")
      .withIndex("by_org_phone", (q) =>
        q.eq("organizationId", args.organizationId).eq("phoneNumber", args.phoneNumber),
      )
      .first();
    return !!row;
  },
});

// Internal variant for webhook callers — same logic, no Clerk auth
// required since it's only invoked from server-to-server contexts that
// have already established the request is from Twilio (signature
// validation upstream).
export const isBlockedInternal = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("blockedNumbers")
      .withIndex("by_org_phone", (q) =>
        q.eq("organizationId", args.organizationId).eq("phoneNumber", args.phoneNumber),
      )
      .first();
    return !!row;
  },
});

// Full list for the org — used in admin views.
export const listForOrg = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    return await ctx.db
      .query("blockedNumbers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();
  },
});

// Block a number. Idempotent — re-blocking returns the existing row.
export const block = mutation({
  args: {
    organizationId: v.id("organizations"),
    phoneNumber: v.string(), // expected E.164
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authorizeOrgMember(ctx, args.organizationId);

    const existing = await ctx.db
      .query("blockedNumbers")
      .withIndex("by_org_phone", (q) =>
        q.eq("organizationId", args.organizationId).eq("phoneNumber", args.phoneNumber),
      )
      .first();

    if (existing) {
      return { success: true, alreadyBlocked: true, id: existing._id };
    }

    const id = await ctx.db.insert("blockedNumbers", {
      organizationId: args.organizationId,
      phoneNumber: args.phoneNumber,
      // `authorizeOrgMember` returns either a tenant `users` row or a
      // `platformUsers` row. Only the tenant row has a usable `_id`
      // for the `users` foreign key — for platform admins we just
      // omit `blockedByUserId`.
      blockedByUserId:
        user && "organizationId" in user
          ? (user._id as import("./_generated/dataModel").Id<"users">)
          : undefined,
      reason: args.reason,
      createdAt: Date.now(),
    });

    return { success: true, alreadyBlocked: false, id };
  },
});

// Unblock a number. Idempotent.
export const unblock = mutation({
  args: {
    organizationId: v.id("organizations"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);

    const existing = await ctx.db
      .query("blockedNumbers")
      .withIndex("by_org_phone", (q) =>
        q.eq("organizationId", args.organizationId).eq("phoneNumber", args.phoneNumber),
      )
      .first();

    if (!existing) {
      return { success: true, wasBlocked: false };
    }

    await ctx.db.delete(existing._id);
    return { success: true, wasBlocked: true };
  },
});
