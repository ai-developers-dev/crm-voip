import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const getByPipeline = query({
  args: { pipelineId: v.id("pipelines") },
  handler: async (ctx, args) => {
    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline", (q) => q.eq("pipelineId", args.pipelineId))
      .collect();
    return stages
      .filter((s) => s.isActive)
      .sort((a, b) => a.order - b.order);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
    name: v.string(),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline", (q) => q.eq("pipelineId", args.pipelineId))
      .collect();
    const activeCount = existing.filter((s) => s.isActive).length;
    if (activeCount >= 10) throw new Error("Maximum of 10 stages per pipeline");
    const now = Date.now();
    return await ctx.db.insert("pipelineStages", {
      organizationId: args.organizationId,
      pipelineId: args.pipelineId,
      name: args.name,
      color: args.color,
      order: existing.length,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("pipelineStages"),
    name: v.optional(v.string()),
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
  args: { id: v.id("pipelineStages") },
  handler: async (ctx, args) => {
    // Cascade delete contacts in this stage
    const contacts = await ctx.db
      .query("pipelineContacts")
      .withIndex("by_stage", (q) => q.eq("stageId", args.id))
      .collect();
    for (const c of contacts) await ctx.db.delete(c._id);
    await ctx.db.delete(args.id);
  },
});

export const reorder = mutation({
  args: {
    stageIds: v.array(v.id("pipelineStages")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (let i = 0; i < args.stageIds.length; i++) {
      await ctx.db.patch(args.stageIds[i], { order: i, updatedAt: now });
    }
  },
});
