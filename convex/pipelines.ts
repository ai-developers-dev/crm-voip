import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const pipelines = await ctx.db
      .query("pipelines")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return pipelines.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const getById = query({
  args: { id: v.id("pipelines") },
  handler: async (ctx, args) => ctx.db.get(args.id),
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    stages: v.array(v.object({ name: v.string(), color: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pipelines")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const now = Date.now();
    const pipelineId = await ctx.db.insert("pipelines", {
      organizationId: args.organizationId,
      name: args.name,
      description: args.description,
      color: args.color,
      isActive: true,
      sortOrder: existing.length,
      createdAt: now,
      updatedAt: now,
    });
    // Create stages
    for (let i = 0; i < args.stages.length && i < 10; i++) {
      await ctx.db.insert("pipelineStages", {
        organizationId: args.organizationId,
        pipelineId,
        name: args.stages[i].name,
        color: args.stages[i].color,
        order: i,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    return pipelineId;
  },
});

export const update = mutation({
  args: {
    id: v.id("pipelines"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("pipelines") },
  handler: async (ctx, args) => {
    // Delete all stages and their contacts
    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline", (q) => q.eq("pipelineId", args.id))
      .collect();
    for (const stage of stages) {
      const contacts = await ctx.db
        .query("pipelineContacts")
        .withIndex("by_stage", (q) => q.eq("stageId", stage._id))
        .collect();
      for (const c of contacts) await ctx.db.delete(c._id);
      await ctx.db.delete(stage._id);
    }
    await ctx.db.delete(args.id);
  },
});
