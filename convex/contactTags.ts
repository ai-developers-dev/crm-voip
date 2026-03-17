import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { authorizeOrgMember } from "./lib/auth";

/** Get all contact tags for an organization */
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const tags = await ctx.db
      .query("contactTags")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return tags.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Get active contact tags for an organization (for contact card picker) */
export const getActive = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const tags = await ctx.db
      .query("contactTags")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return tags
      .filter((t) => t.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Create a new contact tag */
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);

    const existing = await ctx.db
      .query("contactTags")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return await ctx.db.insert("contactTags", {
      organizationId: args.organizationId,
      name: args.name.trim(),
      color: args.color,
      isActive: true,
      sortOrder: existing.length,
      createdAt: Date.now(),
    });
  },
});

/** Update a contact tag */
export const update = mutation({
  args: {
    id: v.id("contactTags"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const tag = await ctx.db.get(args.id);
    if (!tag) throw new Error("Contact tag not found");
    await authorizeOrgMember(ctx, tag.organizationId);

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.color !== undefined) patch.color = args.color;
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    await ctx.db.patch(args.id, patch);
  },
});

/** Delete a contact tag */
export const remove = mutation({
  args: { id: v.id("contactTags") },
  handler: async (ctx, args) => {
    const tag = await ctx.db.get(args.id);
    if (!tag) throw new Error("Contact tag not found");
    await authorizeOrgMember(ctx, tag.organizationId);

    await ctx.db.delete(args.id);
  },
});
