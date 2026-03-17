import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { authorizeOrgMember } from "./lib/auth";

const stepValidator = v.object({
  id: v.string(),
  order: v.number(),
  type: v.union(
    v.literal("send_sms"),
    v.literal("send_email"),
    v.literal("create_task"),
    v.literal("add_tag"),
    v.literal("remove_tag"),
    v.literal("create_note"),
    v.literal("assign_contact"),
    v.literal("wait")
  ),
  config: v.object({
    messageTemplate: v.optional(v.string()),
    emailSubject: v.optional(v.string()),
    emailBodyTemplate: v.optional(v.string()),
    taskTitle: v.optional(v.string()),
    taskDescription: v.optional(v.string()),
    taskType: v.optional(v.string()),
    taskPriority: v.optional(v.string()),
    taskDueDays: v.optional(v.number()),
    tagId: v.optional(v.id("contactTags")),
    noteTemplate: v.optional(v.string()),
    assignToUserId: v.optional(v.id("users")),
    waitMinutes: v.optional(v.number()),
  }),
});

const triggerTypeValidator = v.union(
  v.literal("contact_created"),
  v.literal("tag_added"),
  v.literal("missed_call"),
  v.literal("incoming_sms"),
  v.literal("appointment_reminder"),
  v.literal("task_overdue"),
  v.literal("manual")
);

const triggerConfigValidator = v.optional(v.object({
  tagId: v.optional(v.id("contactTags")),
  reminderMinutes: v.optional(v.number()),
  overdueMinutes: v.optional(v.number()),
}));

/** Get all workflows for an organization */
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return workflows.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Get active workflows for an organization */
export const getActive = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return workflows
      .filter((w) => w.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Get active workflows by trigger type */
export const getByTrigger = query({
  args: {
    organizationId: v.id("organizations"),
    triggerType: triggerTypeValidator,
  },
  handler: async (ctx, args) => {
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_organization_trigger", (q) =>
        q.eq("organizationId", args.organizationId).eq("triggerType", args.triggerType)
      )
      .collect();
    return workflows.filter((w) => w.isActive);
  },
});

/** Get a single workflow by ID */
export const getById = query({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** Create a new workflow */
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    triggerType: triggerTypeValidator,
    triggerConfig: triggerConfigValidator,
    steps: v.array(stepValidator),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);

    const existing = await ctx.db
      .query("workflows")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const now = Date.now();
    return await ctx.db.insert("workflows", {
      organizationId: args.organizationId,
      name: args.name.trim(),
      description: args.description?.trim(),
      isActive: true,
      triggerType: args.triggerType,
      triggerConfig: args.triggerConfig,
      steps: args.steps,
      sortOrder: existing.length,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Update a workflow */
export const update = mutation({
  args: {
    id: v.id("workflows"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    triggerType: v.optional(triggerTypeValidator),
    triggerConfig: triggerConfigValidator,
    steps: v.optional(v.array(stepValidator)),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.id);
    if (!workflow) throw new Error("Workflow not found");
    await authorizeOrgMember(ctx, workflow.organizationId);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description.trim();
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    if (args.triggerType !== undefined) patch.triggerType = args.triggerType;
    if (args.triggerConfig !== undefined) patch.triggerConfig = args.triggerConfig;
    if (args.steps !== undefined) patch.steps = args.steps;
    await ctx.db.patch(args.id, patch);
  },
});

/** Delete a workflow and cancel any running executions */
export const remove = mutation({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.id);
    if (!workflow) throw new Error("Workflow not found");
    await authorizeOrgMember(ctx, workflow.organizationId);

    // Cancel running executions
    const running = await ctx.db
      .query("workflowExecutions")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.id))
      .collect();

    for (const execution of running) {
      if (execution.status === "running") {
        await ctx.db.patch(execution._id, {
          status: "cancelled",
          completedAt: Date.now(),
        });
      }
    }

    await ctx.db.delete(args.id);
  },
});
