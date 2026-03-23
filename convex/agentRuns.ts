import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { authorizeOrgMember } from "./lib/auth";

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    type: v.string(),
    total: v.number(),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);

    return await ctx.db.insert("agentRuns", {
      organizationId: args.organizationId,
      type: args.type,
      status: "running",
      total: args.total,
      succeeded: 0,
      failed: 0,
      startedAt: Date.now(),
    });
  },
});

export const updateProgress = mutation({
  args: {
    id: v.id("agentRuns"),
    succeeded: v.number(),
    failed: v.number(),
    currentLeadName: v.optional(v.string()),
    currentStage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run) throw new Error("Agent run not found");
    await authorizeOrgMember(ctx, run.organizationId);

    await ctx.db.patch(args.id, {
      succeeded: args.succeeded,
      failed: args.failed,
      currentLeadName: args.currentLeadName,
      currentStage: args.currentStage,
    });
  },
});

export const complete = mutation({
  args: {
    id: v.id("agentRuns"),
    status: v.string(),
    succeeded: v.number(),
    failed: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run) throw new Error("Agent run not found");
    await authorizeOrgMember(ctx, run.organizationId);

    await ctx.db.patch(args.id, {
      status: args.status,
      succeeded: args.succeeded,
      failed: args.failed,
      currentLeadName: undefined,
      currentStage: undefined,
      completedAt: Date.now(),
    });
  },
});

export const getLatest = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentRuns")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .first();
  },
});
