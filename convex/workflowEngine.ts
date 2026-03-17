import { v } from "convex/values";
import { internalMutation, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { resolveTemplate } from "./lib/templateVars";

// ============================================
// TRIGGER CHECK — Called by hooks in other files
// ============================================

/** Find matching active workflows and start executions */
export const checkTriggers = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    triggerType: v.string(),
    contactId: v.id("contacts"),
    triggerData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_organization_trigger", (q) =>
        q.eq("organizationId", args.organizationId).eq("triggerType", args.triggerType as any)
      )
      .collect();

    const activeWorkflows = workflows.filter((w) => w.isActive);

    for (const workflow of activeWorkflows) {
      // For tag_added triggers, check if the trigger tag matches
      if (args.triggerType === "tag_added" && workflow.triggerConfig?.tagId) {
        if (args.triggerData?.tagId !== workflow.triggerConfig.tagId) continue;
      }

      // Dedup: don't start if same workflow+contact is already running
      const existing = await ctx.db
        .query("workflowExecutions")
        .withIndex("by_workflow", (q) => q.eq("workflowId", workflow._id))
        .collect();
      const alreadyRunning = existing.some(
        (e) => e.contactId === args.contactId && e.status === "running"
      );
      if (alreadyRunning) continue;

      // Start execution
      await ctx.scheduler.runAfter(0, internal.workflowEngine.startExecution, {
        workflowId: workflow._id,
        contactId: args.contactId,
        organizationId: args.organizationId,
        triggerData: args.triggerData,
      });
    }
  },
});

// ============================================
// EXECUTION LIFECYCLE
// ============================================

/** Create execution record and kick off first step */
export const startExecution = internalMutation({
  args: {
    workflowId: v.id("workflows"),
    contactId: v.id("contacts"),
    organizationId: v.id("organizations"),
    triggerData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow || !workflow.isActive) return;

    const contact = await ctx.db.get(args.contactId);
    if (!contact) return;

    const now = Date.now();
    const snapshotSteps = workflow.steps.map((s) => ({
      id: s.id,
      order: s.order,
      type: s.type,
      config: s.config,
    }));

    const stepResults = snapshotSteps.map((s) => ({
      stepId: s.id,
      status: "pending" as const,
    }));

    const executionId = await ctx.db.insert("workflowExecutions", {
      organizationId: args.organizationId,
      workflowId: args.workflowId,
      contactId: args.contactId,
      status: "running",
      currentStepIndex: 0,
      snapshotSteps,
      stepResults,
      triggerData: args.triggerData,
      startedAt: now,
      createdAt: now,
    });

    // Kick off first step
    if (snapshotSteps.length > 0) {
      await ctx.scheduler.runAfter(0, internal.workflowEngine.executeStep, {
        executionId,
      });
    }
  },
});

/** Execute the current step of a workflow execution */
export const executeStep = internalMutation({
  args: { executionId: v.id("workflowExecutions") },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.status !== "running") return;

    const contact = await ctx.db.get(execution.contactId);
    if (!contact) {
      await ctx.db.patch(args.executionId, {
        status: "failed",
        error: "Contact was deleted",
        completedAt: Date.now(),
      });
      return;
    }

    const step = execution.snapshotSteps[execution.currentStepIndex];
    if (!step) {
      // No more steps — complete
      await ctx.db.patch(args.executionId, {
        status: "completed",
        completedAt: Date.now(),
      });
      return;
    }

    const org = await ctx.db.get(execution.organizationId);
    const stepType = step.type;

    // Get a user for createdByUserId (first admin, or any user)
    const orgUsers = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", execution.organizationId))
      .collect();
    const systemUser = orgUsers.find((u) => u.role === "tenant_admin") || orgUsers[0];

    // Mark step as running
    const updatedResults = [...execution.stepResults];
    const resultIdx = updatedResults.findIndex((r) => r.stepId === step.id);
    if (resultIdx >= 0) {
      updatedResults[resultIdx] = { ...updatedResults[resultIdx], status: "running" };
    }
    await ctx.db.patch(args.executionId, { stepResults: updatedResults });

    try {
      // DB-only steps execute inline
      if (stepType === "create_task") {
        if (!systemUser) {
          await advanceStep(ctx, args.executionId, step.id, "skipped", "No users in organization");
          return;
        }
        await ctx.db.insert("tasks", {
          organizationId: execution.organizationId,
          contactId: execution.contactId,
          title: resolveTemplate(step.config.taskTitle || "Workflow task", { contact, organization: org }),
          description: step.config.taskDescription
            ? resolveTemplate(step.config.taskDescription, { contact, organization: org })
            : undefined,
          type: (step.config.taskType as any) || "follow_up",
          priority: (step.config.taskPriority as any) || "medium",
          status: "todo",
          assignedToUserId: systemUser._id,
          createdByUserId: systemUser._id,
          dueDate: step.config.taskDueDays
            ? Date.now() + step.config.taskDueDays * 86400000
            : undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          workflowExecutionId: args.executionId,
        });
        await advanceStep(ctx, args.executionId, step.id, "completed");
      } else if (stepType === "add_tag" && step.config.tagId) {
        const currentTags = contact.tags || [];
        const tagId = step.config.tagId as Id<"contactTags">;
        if (!currentTags.includes(tagId)) {
          await ctx.db.patch(execution.contactId, {
            tags: [...currentTags, tagId],
          });
        }
        await advanceStep(ctx, args.executionId, step.id, "completed");
      } else if (stepType === "remove_tag" && step.config.tagId) {
        const currentTags = contact.tags || [];
        const tagId = step.config.tagId as Id<"contactTags">;
        await ctx.db.patch(execution.contactId, {
          tags: currentTags.filter((t) => t !== tagId),
        });
        await advanceStep(ctx, args.executionId, step.id, "completed");
      } else if (stepType === "create_note") {
        if (!systemUser) {
          await advanceStep(ctx, args.executionId, step.id, "skipped", "No users in organization");
          return;
        }
        await ctx.db.insert("notes", {
          organizationId: execution.organizationId,
          contactId: execution.contactId,
          content: resolveTemplate(step.config.noteTemplate || "Automated workflow note", { contact, organization: org }),
          createdByUserId: systemUser._id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          workflowExecutionId: args.executionId,
        });
        await advanceStep(ctx, args.executionId, step.id, "completed");
      } else if (stepType === "assign_contact" && step.config.assignToUserId) {
        await ctx.db.patch(execution.contactId, {
          assignedUserId: step.config.assignToUserId as Id<"users">,
        });
        await advanceStep(ctx, args.executionId, step.id, "completed");
      } else if (stepType === "wait") {
        const waitMs = (step.config.waitMinutes || 1) * 60000;
        await advanceStep(ctx, args.executionId, step.id, "completed");
        // Schedule next step after wait
        const scheduledId = await ctx.scheduler.runAfter(
          waitMs,
          internal.workflowEngine.executeStep,
          { executionId: args.executionId }
        );
        await ctx.db.patch(args.executionId, {
          nextStepScheduledId: String(scheduledId),
        });
        return; // Don't advance further — resumeAfterWait will continue
      } else if (stepType === "send_sms") {
        // SMS requires calling Twilio API — schedule action
        await ctx.scheduler.runAfter(0, internal.workflowEngine.executeSendSms, {
          executionId: args.executionId,
          stepId: step.id,
          stepIndex: execution.currentStepIndex,
        });
        return; // Action will call advanceStepMutation when done
      } else if (stepType === "send_email") {
        // Email — mark as skipped for now (no email provider configured)
        await advanceStep(ctx, args.executionId, step.id, "skipped", "Email sending not yet configured");
      } else {
        await advanceStep(ctx, args.executionId, step.id, "skipped", "Unknown or incomplete step config");
      }
    } catch (error: any) {
      await advanceStep(ctx, args.executionId, step.id, "failed", error.message || "Step execution failed");
    }
  },
});

/** Helper to advance to next step (used within mutations) */
async function advanceStep(
  ctx: any,
  executionId: Id<"workflowExecutions">,
  stepId: string,
  status: "completed" | "failed" | "skipped",
  error?: string
) {
  const execution = await ctx.db.get(executionId);
  if (!execution) return;

  const updatedResults = [...execution.stepResults];
  const resultIdx = updatedResults.findIndex((r: any) => r.stepId === stepId);
  if (resultIdx >= 0) {
    updatedResults[resultIdx] = {
      ...updatedResults[resultIdx],
      status,
      executedAt: Date.now(),
      ...(error ? { error } : {}),
    };
  }

  const nextIndex = execution.currentStepIndex + 1;
  const isComplete = nextIndex >= execution.snapshotSteps.length;

  await ctx.db.patch(executionId, {
    stepResults: updatedResults,
    currentStepIndex: nextIndex,
    ...(isComplete
      ? { status: status === "failed" ? "failed" : "completed", completedAt: Date.now(), error }
      : {}),
  });

  // Schedule next step if not complete and not a wait step
  if (!isComplete) {
    await ctx.scheduler.runAfter(0, internal.workflowEngine.executeStep, {
      executionId,
    });
  }
}

// ============================================
// EXTERNAL API ACTIONS
// ============================================

/** Send SMS via Twilio API */
export const executeSendSms = internalAction({
  args: {
    executionId: v.id("workflowExecutions"),
    stepId: v.string(),
    stepIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.runQuery(internal.workflowEngine.getExecution, {
      executionId: args.executionId,
    });
    if (!execution || execution.status !== "running") return;

    const step = execution.snapshotSteps[args.stepIndex];
    if (!step) return;

    const contact = await ctx.runQuery(internal.workflowEngine.getContact, {
      contactId: execution.contactId,
    });
    if (!contact) {
      await ctx.runMutation(internal.workflowEngine.advanceStepMutation, {
        executionId: args.executionId,
        stepId: args.stepId,
        status: "failed",
        error: "Contact not found",
      });
      return;
    }

    const org = await ctx.runQuery(internal.workflowEngine.getOrganization, {
      organizationId: execution.organizationId,
    });

    // Get primary phone number
    const primaryPhone = contact.phoneNumbers.find((p) => p.isPrimary) || contact.phoneNumbers[0];
    if (!primaryPhone) {
      await ctx.runMutation(internal.workflowEngine.advanceStepMutation, {
        executionId: args.executionId,
        stepId: args.stepId,
        status: "skipped",
        error: "Contact has no phone number",
      });
      return;
    }

    const message = resolveTemplate(
      step.config.messageTemplate || "",
      { contact, organization: org }
    );

    if (!message.trim()) {
      await ctx.runMutation(internal.workflowEngine.advanceStepMutation, {
        executionId: args.executionId,
        stepId: args.stepId,
        status: "skipped",
        error: "Empty message template",
      });
      return;
    }

    // Get Twilio credentials from org's phone number config
    const phoneNumber = await ctx.runQuery(internal.workflowEngine.getOrgPhoneNumber, {
      organizationId: execution.organizationId,
    });

    if (!phoneNumber) {
      await ctx.runMutation(internal.workflowEngine.advanceStepMutation, {
        executionId: args.executionId,
        stepId: args.stepId,
        status: "skipped",
        error: "No Twilio phone number configured",
      });
      return;
    }

    try {
      // Send via Twilio REST API
      const accountSid = process.env.TWILIO_ACCOUNT_SID!;
      const authToken = process.env.TWILIO_AUTH_TOKEN!;

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: primaryPhone.number,
            From: phoneNumber.phoneNumber,
            Body: message,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Twilio error: ${response.status} ${err}`);
      }

      // Also store the message in conversations
      await ctx.runMutation(internal.workflowEngine.storeOutboundSms, {
        organizationId: execution.organizationId,
        contactId: execution.contactId,
        to: primaryPhone.number,
        from: phoneNumber.phoneNumber,
        body: message,
        workflowExecutionId: args.executionId,
      });

      await ctx.runMutation(internal.workflowEngine.advanceStepMutation, {
        executionId: args.executionId,
        stepId: args.stepId,
        status: "completed",
      });
    } catch (error: any) {
      await ctx.runMutation(internal.workflowEngine.advanceStepMutation, {
        executionId: args.executionId,
        stepId: args.stepId,
        status: "failed",
        error: error.message || "SMS send failed",
      });
    }
  },
});

// ============================================
// INTERNAL HELPER QUERIES/MUTATIONS (for actions)
// ============================================

/** Get execution record (for use in actions) */
export const getExecution = internalQuery({
  args: { executionId: v.id("workflowExecutions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.executionId);
  },
});

/** Get contact (for use in actions) */
export const getContact = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.contactId);
  },
});

/** Get organization (for use in actions) */
export const getOrganization = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.organizationId);
  },
});

/** Get org's Twilio phone number */
export const getOrgPhoneNumber = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("phoneNumbers")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .first();
  },
});

/** Store outbound SMS in conversations */
export const storeOutboundSms = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    to: v.string(),
    from: v.string(),
    body: v.string(),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find or create conversation
    let conversation = await ctx.db
      .query("conversations")
      .withIndex("by_phone_numbers", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("customerPhoneNumber", args.to)
          .eq("businessPhoneNumber", args.from)
      )
      .first();

    if (!conversation) {
      const contact = await ctx.db.get(args.contactId);
      const conversationId = await ctx.db.insert("conversations", {
        organizationId: args.organizationId,
        customerPhoneNumber: args.to,
        businessPhoneNumber: args.from,
        contactId: args.contactId,
        contactName: contact ? `${contact.firstName} ${contact.lastName || ""}`.trim() : undefined,
        status: "active",
        lastMessageAt: now,
        lastMessagePreview: args.body.substring(0, 50),
        unreadCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      conversation = await ctx.db.get(conversationId);
    }

    if (conversation) {
      await ctx.db.insert("messages", {
        conversationId: conversation._id,
        organizationId: args.organizationId,
        twilioMessageSid: `workflow-${Date.now()}`,
        direction: "outbound",
        from: args.from,
        to: args.to,
        body: args.body,
        status: "sent",
        segmentCount: Math.ceil(args.body.length / 160),
        sentAt: now,
        createdAt: now,
        workflowExecutionId: args.workflowExecutionId,
      });

      await ctx.db.patch(conversation._id, {
        lastMessageAt: now,
        lastMessagePreview: args.body.substring(0, 50),
        updatedAt: now,
      });
    }
  },
});

/** Advance step (called from actions) */
export const advanceStepMutation = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    stepId: v.string(),
    status: v.union(v.literal("completed"), v.literal("failed"), v.literal("skipped")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await advanceStep(ctx, args.executionId, args.stepId, args.status, args.error);
  },
});
