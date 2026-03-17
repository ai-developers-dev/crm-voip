import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Log a consent event
export const log = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.optional(v.id("contacts")),
    phoneNumber: v.string(),
    action: v.string(),  // "opt_out" | "opt_in" | "first_message" | "error_21610"
    keyword: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("smsConsent", { ...args, timestamp: Date.now() });
  },
});

// Get consent history for a contact
export const getByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db.query("smsConsent")
      .withIndex("by_contact", q => q.eq("contactId", args.contactId))
      .order("desc")
      .take(50);
  },
});

// Get recent consent events for org
export const getByOrganization = query({
  args: { organizationId: v.id("organizations"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db.query("smsConsent")
      .withIndex("by_organization", q => q.eq("organizationId", args.organizationId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});
