import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
    return notes.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    content: v.string(),
    createdByUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("notes", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("notes"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Note not found");
    await ctx.db.patch(args.id, {
      content: args.content,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
