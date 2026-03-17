import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { authorizeOrgMember } from "./lib/auth";

/** Get executions for a specific workflow (last 50) */
export const getByWorkflow = query({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const executions = await ctx.db
      .query("workflowExecutions")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .order("desc")
      .take(50);
    return executions;
  },
});

/** Get currently running executions for an organization */
export const getRunning = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflowExecutions")
      .withIndex("by_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "running")
      )
      .collect();
  },
});

/** Get recent executions for an organization (last 100) */
export const getRecent = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflowExecutions")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .take(100);
  },
});

/** Get executions for a specific contact */
export const getByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflowExecutions")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .order("desc")
      .take(50);
  },
});

/** Get stats for all workflows in an org (total, running, completed, failed counts) */
export const getStatsByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const executions = await ctx.db
      .query("workflowExecutions")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const stats: Record<string, { total: number; running: number; completed: number; failed: number }> = {};
    for (const ex of executions) {
      const wId = ex.workflowId;
      if (!stats[wId]) stats[wId] = { total: 0, running: 0, completed: 0, failed: 0 };
      stats[wId].total++;
      if (ex.status === "running") stats[wId].running++;
      else if (ex.status === "completed") stats[wId].completed++;
      else if (ex.status === "failed") stats[wId].failed++;
    }
    return stats;
  },
});

/** Get executions for a workflow with contact details */
export const getByWorkflowWithContacts = query({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const executions = await ctx.db
      .query("workflowExecutions")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .order("desc")
      .take(100);

    const results = await Promise.all(
      executions.map(async (ex) => {
        const contact = await ctx.db.get(ex.contactId);
        return {
          ...ex,
          contactName: contact
            ? `${contact.firstName} ${contact.lastName || ""}`.trim()
            : "Deleted Contact",
          contactPhone: contact?.phoneNumbers?.[0]?.number,
        };
      })
    );
    return results;
  },
});

/** Cancel a running execution */
export const cancel = mutation({
  args: { executionId: v.id("workflowExecutions") },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.status !== "running") return;
    await authorizeOrgMember(ctx, execution.organizationId);

    await ctx.db.patch(args.executionId, {
      status: "cancelled",
      completedAt: Date.now(),
    });
  },
});
