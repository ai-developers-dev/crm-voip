import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const EXPIRY_MS = 25 * 24 * 60 * 60 * 1000; // 25 days (NatGen remembers ~30 days)

// Get saved browser storageState (cookies/localStorage)
export const getStorageState = query({
  args: {
    carrierKey: v.string(),
    credentialHash: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("portalSessions")
      .withIndex("by_carrier_cred", (q) =>
        q.eq("carrierKey", args.carrierKey).eq("credentialHash", args.credentialHash)
      )
      .first();

    if (!session) return null;

    // Expire after 25 days
    if (Date.now() - session.updatedAt > EXPIRY_MS) return null;

    return session.storageState;
  },
});

// Save browser storageState after successful login/2FA
export const saveStorageState = mutation({
  args: {
    carrierKey: v.string(),
    credentialHash: v.string(),
    storageState: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("portalSessions")
      .withIndex("by_carrier_cred", (q) =>
        q.eq("carrierKey", args.carrierKey).eq("credentialHash", args.credentialHash)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        storageState: args.storageState,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("portalSessions", {
        carrierKey: args.carrierKey,
        credentialHash: args.credentialHash,
        storageState: args.storageState,
        updatedAt: Date.now(),
      });
    }
  },
});
