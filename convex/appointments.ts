import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authorizeOrgMember } from "./lib/auth";

export const getById = query({
  args: { id: v.id("appointments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("appointments")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
  },
});

export const getByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("appointments")
      .withIndex("by_date", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("appointmentDate", args.startDate)
          .lte("appointmentDate", args.endDate)
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
    const all = await ctx.db
      .query("appointments")
      .withIndex("by_assigned_user", (q) => q.eq("assignedToUserId", args.userId))
      .collect();
    return all.filter(
      (a) => a.appointmentDate >= args.startDate && a.appointmentDate <= args.endDate
    );
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.optional(v.id("contacts")),
    title: v.string(),
    description: v.optional(v.string()),
    appointmentDate: v.number(),
    endDate: v.optional(v.number()),
    location: v.optional(v.string()),
    type: v.union(
      v.literal("meeting"),
      v.literal("call"),
      v.literal("video"),
      v.literal("other")
    ),
    assignedToUserId: v.optional(v.id("users")),
    createdByUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    const now = Date.now();
    return await ctx.db.insert("appointments", {
      ...args,
      status: "scheduled",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("appointments"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    appointmentDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    location: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("meeting"),
        v.literal("call"),
        v.literal("video"),
        v.literal("other")
      )
    ),
    status: v.optional(
      v.union(
        v.literal("scheduled"),
        v.literal("completed"),
        v.literal("cancelled"),
        v.literal("no_show")
      )
    ),
    assignedToUserId: v.optional(v.id("users")),
    contactId: v.optional(v.id("contacts")),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Appointment not found");
    await authorizeOrgMember(ctx, existing.organizationId);
    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("appointments") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Appointment not found");
    await authorizeOrgMember(ctx, existing.organizationId);
    await ctx.db.delete(args.id);
  },
});
