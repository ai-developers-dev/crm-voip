import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get emails for a specific contact
export const getByContact = query({
  args: {
    contactId: v.id("contacts"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emails")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .order("desc")
      .collect();
  },
});

// Get emails by organization (for admin views)
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emails")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(100);
  },
});

// Get email by Nylas message ID (for deduplication)
export const getByNylasMessageId = query({
  args: { nylasMessageId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emails")
      .withIndex("by_nylas_message", (q) =>
        q.eq("nylasMessageId", args.nylasMessageId)
      )
      .first();
  },
});

// Create an email record
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.optional(v.id("contacts")),
    emailAccountId: v.id("emailAccounts"),
    nylasMessageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    direction: v.string(),
    from: v.string(),
    to: v.array(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    subject: v.string(),
    bodyPlain: v.optional(v.string()),
    bodyHtml: v.optional(v.string()),
    snippet: v.optional(v.string()),
    hasAttachments: v.optional(v.boolean()),
    attachments: v.optional(v.array(v.object({
      fileName: v.string(),
      contentType: v.string(),
      size: v.number(),
      nylasFileId: v.optional(v.string()),
    }))),
    status: v.string(),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("emails", args);
  },
});

// Update email status (for delivery tracking)
export const updateStatus = mutation({
  args: {
    emailId: v.id("emails"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.emailId, { status: args.status });
  },
});

// Match a contact by email address within an organization
export const matchContactByEmail = query({
  args: {
    organizationId: v.id("organizations"),
    emailAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedEmail = args.emailAddress.toLowerCase().trim();
    return await ctx.db
      .query("contacts")
      .withIndex("by_organization_email", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", normalizedEmail)
      )
      .first();
  },
});
