import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
    return documents.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    title: v.string(),
    description: v.optional(v.string()),
    type: v.string(),
    fileName: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    status: v.string(),
    createdByUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("documents", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("documents"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    type: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Document not found");
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
