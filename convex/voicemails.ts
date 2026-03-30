import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authorizeOrgMember } from "./lib/auth";

// Store a new voicemail from a recording webhook
export const store = mutation({
  args: {
    organizationId: v.id("organizations"),
    twilioCallSid: v.string(),
    recordingSid: v.string(),
    recordingUrl: v.string(),
    duration: v.number(),
    callerNumber: v.string(),
    callerName: v.optional(v.string()),
    callHistoryId: v.optional(v.id("callHistory")),
    contactId: v.optional(v.id("contacts")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("voicemails", {
      ...args,
      isRead: false,
      createdAt: Date.now(),
    });
  },
});

// List voicemails for an organization
export const list = query({
  args: {
    organizationId: v.id("organizations"),
    unreadOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);

    let voicemails;
    if (args.unreadOnly) {
      voicemails = await ctx.db
        .query("voicemails")
        .withIndex("by_organization_read", (q) =>
          q.eq("organizationId", args.organizationId).eq("isRead", false)
        )
        .collect();
    } else {
      voicemails = await ctx.db
        .query("voicemails")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect();
    }

    return voicemails.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Mark a voicemail as read
export const markRead = mutation({
  args: { voicemailId: v.id("voicemails") },
  handler: async (ctx, args) => {
    const voicemail = await ctx.db.get(args.voicemailId);
    if (!voicemail) throw new Error("Voicemail not found");
    await authorizeOrgMember(ctx, voicemail.organizationId);
    await ctx.db.patch(args.voicemailId, { isRead: true });
  },
});

// Get unread count for an organization
export const getUnreadCount = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    const unread = await ctx.db
      .query("voicemails")
      .withIndex("by_organization_read", (q) =>
        q.eq("organizationId", args.organizationId).eq("isRead", false)
      )
      .collect();
    return unread.length;
  },
});
