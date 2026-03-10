import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("calendarEvents")
      .withIndex("by_organization", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("startTime", args.startDate)
          .lte("startTime", args.endDate)
      )
      .collect();
  },
});

export const getByUser = query({
  args: {
    userId: v.id("users"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("calendarEvents")
      .withIndex("by_user", (q) =>
        q
          .eq("userId", args.userId)
          .gte("startTime", args.startDate)
          .lte("startTime", args.endDate)
      )
      .collect();
  },
});

export const getByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("calendarEvents")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
  },
});

export const getUpcoming = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results = await ctx.db
      .query("calendarEvents")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId).gte("startTime", now)
      )
      .take(args.limit ?? 20);
    return results;
  },
});

export const getByNylasEventId = query({
  args: { nylasEventId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("calendarEvents")
      .withIndex("by_nylas_event", (q) => q.eq("nylasEventId", args.nylasEventId))
      .first();
  },
});

export const upsert = mutation({
  args: {
    organizationId: v.id("organizations"),
    emailAccountId: v.id("emailAccounts"),
    nylasEventId: v.string(),
    nylasCalendarId: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    location: v.optional(v.string()),
    isAllDay: v.optional(v.boolean()),
    status: v.string(),
    busy: v.optional(v.boolean()),
    conferenceUrl: v.optional(v.string()),
    attendees: v.optional(v.array(v.object({
      email: v.string(),
      name: v.optional(v.string()),
      status: v.string(),
    }))),
    recurringEventId: v.optional(v.string()),
    contactId: v.optional(v.id("contacts")),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("calendarEvents")
      .withIndex("by_nylas_event", (q) => q.eq("nylasEventId", args.nylasEventId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        lastSyncedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("calendarEvents", {
        ...args,
        lastSyncedAt: now,
      });
    }
  },
});

export const remove = mutation({
  args: { nylasEventId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("calendarEvents")
      .withIndex("by_nylas_event", (q) => q.eq("nylasEventId", args.nylasEventId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const matchContactByAttendeeEmail = query({
  args: {
    organizationId: v.id("organizations"),
    emails: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    for (const email of args.emails) {
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_organization_email", (q) =>
          q.eq("organizationId", args.organizationId).eq("email", email.toLowerCase())
        )
        .first();
      if (contact) return contact._id;
    }
    return null;
  },
});
