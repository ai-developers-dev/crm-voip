import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authorizeOrgMember } from "./lib/auth";

export const getByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    title: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal("call_back"),
      v.literal("send_email"),
      v.literal("follow_up"),
      v.literal("meeting"),
      v.literal("other")
    ),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("urgent")
    ),
    assignedToUserId: v.id("users"),
    createdByUserId: v.id("users"),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    const now = Date.now();
    return await ctx.db.insert("tasks", {
      ...args,
      status: "todo",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("call_back"),
        v.literal("send_email"),
        v.literal("follow_up"),
        v.literal("meeting"),
        v.literal("other")
      )
    ),
    priority: v.optional(
      v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
        v.literal("urgent")
      )
    ),
    status: v.optional(
      v.union(
        v.literal("todo"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("cancelled")
      )
    ),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Task not found");
    await authorizeOrgMember(ctx, existing.organizationId);

    const patch: Record<string, unknown> = { ...updates, updatedAt: Date.now() };
    if (updates.status === "completed" && existing.status !== "completed") {
      patch.completedAt = Date.now();
    }
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Task not found");
    await authorizeOrgMember(ctx, existing.organizationId);
    await ctx.db.delete(args.id);
  },
});
