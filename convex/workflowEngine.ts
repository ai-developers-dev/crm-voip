import { v } from "convex/values";
import { internalMutation, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { resolveTemplate } from "./lib/templateVars";
import { evaluateConditions, type Condition } from "./lib/conditionEvaluator";

// Multi-branch normalization (server-side mirror of client normalizeBranches)
interface BranchDef {
  id: string;
  name: string;
  conditions: Condition[];
  conditionLogic: "and" | "or";
  steps: any[];
  isDefault?: boolean;
}

function normalizeBranches(config: any): BranchDef[] {
  if (config.branches && config.branches.length > 0) return config.branches;
  return [
    {
      id: "legacy-yes",
      name: "Branch",
      conditions: (config.conditions || []) as Condition[],
      conditionLogic: (config.conditionLogic as "and" | "or") || "and",
      steps: (config.yesBranch || []) as any[],
    },
    {
      id: "legacy-none",
      name: "None",
      conditions: [],
      conditionLogic: "and" as const,
      steps: (config.noBranch || []) as any[],
      isDefault: true,
    },
  ];
}

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
      } else if (stepType === "if_else") {
        // Pre-fetch related data for condition evaluation
        const [tasks, appointments, pipelineContacts] = await Promise.all([
          ctx.db.query("tasks").filter((q) => q.eq(q.field("contactId"), execution.contactId)).collect(),
          ctx.db.query("appointments").filter((q) => q.eq(q.field("contactId"), execution.contactId)).collect(),
          ctx.db.query("pipelineContacts").withIndex("by_contact", (q) => q.eq("contactId", execution.contactId)).collect(),
        ]);

        const evalContext = {
          tasks: tasks as any,
          appointments: appointments as any,
          pipelineContacts: pipelineContacts as any,
          now: new Date(),
        };

        // Multi-branch evaluation: first matching branch wins, else "None"
        const branches = normalizeBranches(step.config);
        const defaultBranch = branches.find(b => b.isDefault) || branches[branches.length - 1];
        let winningBranch = defaultBranch;

        for (const branch of branches) {
          if (branch.isDefault) continue;
          if (branch.conditions.length === 0) continue;
          const match = evaluateConditions(branch.conditions, branch.conditionLogic, contact, evalContext);
          if (match) { winningBranch = branch; break; }
        }

        const branchId = winningBranch.id;
        const branchSteps = winningBranch.steps || [];

        // Record which branch was taken on the if_else step itself
        const ifElseResults = [...execution.stepResults];
        const ifIdx = ifElseResults.findIndex((r: any) => r.stepId === step.id);
        if (ifIdx >= 0) {
          ifElseResults[ifIdx] = {
            ...ifElseResults[ifIdx],
            status: "completed",
            executedAt: Date.now(),
            branchResult: branchId,
          };
        }

        if (branchSteps.length === 0) {
          // Empty branch — advance past if_else to next top-level step
          await ctx.db.patch(args.executionId, { stepResults: ifElseResults });
          await advanceStep(ctx, args.executionId, step.id, "completed");
          return;
        }

        // Add branch step results as pending
        for (const branchStep of branchSteps) {
          ifElseResults.push({
            stepId: branchStep.id,
            status: "pending" as const,
            branchPath: `${step.id}.${branchId}`,
          });
        }

        // Set execution pointer to track branch position
        await ctx.db.patch(args.executionId, {
          stepResults: ifElseResults,
          executionPointer: {
            stack: [],
            current: {
              parentStepId: step.id,
              branch: branchId,
              branchSteps: branchSteps,
              branchIndex: 0,
              returnToStepIndex: execution.currentStepIndex + 1,
            },
          },
        });

        // Schedule first branch step
        await ctx.scheduler.runAfter(0, internal.workflowEngine.executeBranchStep, {
          executionId: args.executionId,
        });
        return;
      } else if (stepType === "ai_sms_agent") {
        // Start an AI SMS conversation with the contact
        const smsAgentId = step.config.smsAgentId as Id<"smsAgents">;
        if (!smsAgentId) {
          await advanceStep(ctx, args.executionId, step.id, "skipped", "No SMS agent selected");
          return;
        }
        await ctx.scheduler.runAfter(0, internal.smsAiEngine.startConversation, {
          organizationId: execution.organizationId,
          contactId: execution.contactId,
          smsAgentId,
          workflowExecutionId: args.executionId,
        });
        // AI conversation runs async — advance workflow immediately
        await advanceStep(ctx, args.executionId, step.id, "completed");
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

    // Check if contact has opted out of SMS
    if (contact.smsOptedOut) {
      await ctx.runMutation(internal.workflowEngine.advanceStepMutation, {
        executionId: args.executionId,
        stepId: args.stepId,
        status: "skipped",
        error: "Contact has opted out of SMS (DND)",
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

// ============================================
// BRANCH EXECUTION (If/Else)
// ============================================

/** Execute the current branch step using the executionPointer */
export const executeBranchStep = internalMutation({
  args: { executionId: v.id("workflowExecutions") },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.status !== "running") return;

    const pointer = execution.executionPointer as any;
    if (!pointer?.current) {
      // No pointer — should not happen, advance normally
      await ctx.scheduler.runAfter(0, internal.workflowEngine.executeStep, {
        executionId: args.executionId,
      });
      return;
    }

    const { branchSteps, branchIndex, parentStepId, branch } = pointer.current;
    const step = branchSteps[branchIndex];
    if (!step) {
      // Branch done — return to main flow
      await returnFromBranch(ctx, args.executionId, pointer);
      return;
    }

    const contact = await ctx.db.get(execution.contactId);
    if (!contact) {
      await ctx.db.patch(args.executionId, {
        status: "failed",
        error: "Contact was deleted",
        completedAt: Date.now(),
      });
      return;
    }

    const org = await ctx.db.get(execution.organizationId);
    const orgUsers = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", execution.organizationId))
      .collect();
    const systemUser = orgUsers.find((u) => u.role === "tenant_admin") || orgUsers[0];

    // Mark branch step as running
    const updatedResults = [...execution.stepResults];
    const rIdx = updatedResults.findIndex((r: any) => r.stepId === step.id);
    if (rIdx >= 0) {
      updatedResults[rIdx] = { ...updatedResults[rIdx], status: "running" };
    }
    await ctx.db.patch(args.executionId, { stepResults: updatedResults });

    const stepType = step.type;

    try {
      if (stepType === "create_task") {
        if (!systemUser) {
          await advanceBranchStep(ctx, args.executionId, step.id, "skipped", "No users in organization");
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
          dueDate: step.config.taskDueDays ? Date.now() + step.config.taskDueDays * 86400000 : undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          workflowExecutionId: args.executionId,
        });
        await advanceBranchStep(ctx, args.executionId, step.id, "completed");
      } else if (stepType === "add_tag" && step.config.tagId) {
        const currentTags = contact.tags || [];
        const tagId = step.config.tagId as Id<"contactTags">;
        if (!currentTags.includes(tagId)) {
          await ctx.db.patch(execution.contactId, { tags: [...currentTags, tagId] });
        }
        await advanceBranchStep(ctx, args.executionId, step.id, "completed");
      } else if (stepType === "remove_tag" && step.config.tagId) {
        const currentTags = contact.tags || [];
        const tagId = step.config.tagId as Id<"contactTags">;
        await ctx.db.patch(execution.contactId, { tags: currentTags.filter((t) => t !== tagId) });
        await advanceBranchStep(ctx, args.executionId, step.id, "completed");
      } else if (stepType === "create_note") {
        if (!systemUser) {
          await advanceBranchStep(ctx, args.executionId, step.id, "skipped", "No users in organization");
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
        await advanceBranchStep(ctx, args.executionId, step.id, "completed");
      } else if (stepType === "assign_contact" && step.config.assignToUserId) {
        await ctx.db.patch(execution.contactId, {
          assignedUserId: step.config.assignToUserId as Id<"users">,
        });
        await advanceBranchStep(ctx, args.executionId, step.id, "completed");
      } else if (stepType === "wait") {
        const waitMs = (step.config.waitMinutes || 1) * 60000;
        await advanceBranchStep(ctx, args.executionId, step.id, "completed");
        // Schedule next branch step after wait
        await ctx.scheduler.runAfter(waitMs, internal.workflowEngine.executeBranchStep, {
          executionId: args.executionId,
        });
        return;
      } else if (stepType === "send_sms") {
        await ctx.scheduler.runAfter(0, internal.workflowEngine.executeSendSmsBranch, {
          executionId: args.executionId,
          stepId: step.id,
        });
        return;
      } else if (stepType === "send_email") {
        await advanceBranchStep(ctx, args.executionId, step.id, "skipped", "Email sending not yet configured");
      } else if (stepType === "if_else") {
        // Nested if/else — evaluate branches and push onto stack
        const [tasks, appointments, pipelineContacts] = await Promise.all([
          ctx.db.query("tasks").filter((q) => q.eq(q.field("contactId"), execution.contactId)).collect(),
          ctx.db.query("appointments").filter((q) => q.eq(q.field("contactId"), execution.contactId)).collect(),
          ctx.db.query("pipelineContacts").withIndex("by_contact", (q) => q.eq("contactId", execution.contactId)).collect(),
        ]);

        const evalContext = {
          tasks: tasks as any,
          appointments: appointments as any,
          pipelineContacts: pipelineContacts as any,
          now: new Date(),
        };

        // Multi-branch evaluation: first matching branch wins, else "None"
        const nestedBranches = normalizeBranches(step.config);
        const nestedDefault = nestedBranches.find(b => b.isDefault) || nestedBranches[nestedBranches.length - 1];
        let winningBranch = nestedDefault;

        for (const nb of nestedBranches) {
          if (nb.isDefault) continue;
          if (nb.conditions.length === 0) continue;
          const match = evaluateConditions(nb.conditions, nb.conditionLogic, contact, evalContext);
          if (match) { winningBranch = nb; break; }
        }

        const nestedBranchId = winningBranch.id;
        const nestedBranchSteps = winningBranch.steps || [];

        // Mark this nested if_else step as completed with branch result
        const nestedResults = [...(await ctx.db.get(args.executionId))!.stepResults];
        const nIdx = nestedResults.findIndex((r: any) => r.stepId === step.id);
        if (nIdx >= 0) {
          nestedResults[nIdx] = {
            ...nestedResults[nIdx],
            status: "completed",
            executedAt: Date.now(),
            branchResult: nestedBranchId,
          };
        }

        if (nestedBranchSteps.length === 0) {
          // Empty nested branch — advance in current branch
          await ctx.db.patch(args.executionId, { stepResults: nestedResults });
          await advanceBranchStep(ctx, args.executionId, step.id, "completed");
          return;
        }

        // Add nested branch step results
        for (const bs of nestedBranchSteps) {
          nestedResults.push({
            stepId: bs.id,
            status: "pending" as const,
            branchPath: `${step.id}.${nestedBranchId}`,
          });
        }

        // Push current branch onto stack, create new pointer for nested branch
        const currentExec = await ctx.db.get(args.executionId);
        const currentPointer = currentExec!.executionPointer as any;
        const newStack = [...(currentPointer.stack || []), {
          ...currentPointer.current,
          branchIndex: currentPointer.current.branchIndex + 1, // resume after this if_else
        }];

        await ctx.db.patch(args.executionId, {
          stepResults: nestedResults,
          executionPointer: {
            stack: newStack,
            current: {
              parentStepId: step.id,
              branch: nestedBranchId,
              branchSteps: nestedBranchSteps,
              branchIndex: 0,
              returnToStepIndex: -1, // Will pop from stack instead
            },
          },
        });

        await ctx.scheduler.runAfter(0, internal.workflowEngine.executeBranchStep, {
          executionId: args.executionId,
        });
        return;
      } else {
        await advanceBranchStep(ctx, args.executionId, step.id, "skipped", "Unknown or incomplete step config");
      }
    } catch (error: any) {
      await advanceBranchStep(ctx, args.executionId, step.id, "failed", error.message || "Branch step execution failed");
    }
  },
});

/** Helper: advance to next branch step or return from branch */
async function advanceBranchStep(
  ctx: any,
  executionId: Id<"workflowExecutions">,
  stepId: string,
  status: "completed" | "failed" | "skipped",
  error?: string
) {
  const execution = await ctx.db.get(executionId);
  if (!execution) return;

  // Update step result
  const updatedResults = [...execution.stepResults];
  const rIdx = updatedResults.findIndex((r: any) => r.stepId === stepId);
  if (rIdx >= 0) {
    updatedResults[rIdx] = {
      ...updatedResults[rIdx],
      status,
      executedAt: Date.now(),
      ...(error ? { error } : {}),
    };
  }

  if (status === "failed") {
    await ctx.db.patch(executionId, {
      stepResults: updatedResults,
      status: "failed",
      error,
      completedAt: Date.now(),
    });
    return;
  }

  const pointer = execution.executionPointer as any;
  if (!pointer?.current) return;

  const nextBranchIndex = pointer.current.branchIndex + 1;
  const branchDone = nextBranchIndex >= pointer.current.branchSteps.length;

  if (branchDone) {
    await ctx.db.patch(executionId, { stepResults: updatedResults });
    await returnFromBranch(ctx, executionId, pointer);
  } else {
    // More branch steps — advance pointer
    await ctx.db.patch(executionId, {
      stepResults: updatedResults,
      executionPointer: {
        ...pointer,
        current: { ...pointer.current, branchIndex: nextBranchIndex },
      },
    });
    await ctx.scheduler.runAfter(0, internal.workflowEngine.executeBranchStep, {
      executionId,
    });
  }
}

/** Helper: return from a branch to the parent context */
async function returnFromBranch(
  ctx: any,
  executionId: Id<"workflowExecutions">,
  pointer: any
) {
  const stack = pointer.stack || [];

  if (stack.length > 0) {
    // Pop from stack — return to parent branch
    const parentContext = stack[stack.length - 1];
    const newStack = stack.slice(0, -1);

    await ctx.db.patch(executionId, {
      executionPointer: {
        stack: newStack,
        current: parentContext,
      },
    });

    // Continue executing parent branch
    await ctx.scheduler.runAfter(0, internal.workflowEngine.executeBranchStep, {
      executionId,
    });
  } else {
    // No stack — return to main flow
    const returnToIndex = pointer.current.returnToStepIndex;
    const execution = await ctx.db.get(executionId);
    if (!execution) return;

    const isComplete = returnToIndex >= execution.snapshotSteps.length;

    await ctx.db.patch(executionId, {
      currentStepIndex: returnToIndex,
      executionPointer: undefined,
      ...(isComplete ? { status: "completed", completedAt: Date.now() } : {}),
    });

    if (!isComplete) {
      await ctx.scheduler.runAfter(0, internal.workflowEngine.executeStep, {
        executionId,
      });
    }
  }
}

/** Send SMS from within a branch (action wrapper) */
export const executeSendSmsBranch = internalAction({
  args: {
    executionId: v.id("workflowExecutions"),
    stepId: v.string(),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.runQuery(internal.workflowEngine.getExecution, {
      executionId: args.executionId,
    });
    if (!execution || execution.status !== "running") return;

    // Find the step in stepResults to get its config from the branch
    const pointer = execution.executionPointer as any;
    if (!pointer?.current) return;

    const step = pointer.current.branchSteps.find((s: any) => s.id === args.stepId);
    if (!step) return;

    const contact = await ctx.runQuery(internal.workflowEngine.getContact, {
      contactId: execution.contactId,
    });
    if (!contact) {
      await ctx.runMutation(internal.workflowEngine.advanceBranchStepMutation, {
        executionId: args.executionId, stepId: args.stepId, status: "failed", error: "Contact not found",
      });
      return;
    }

    if (contact.smsOptedOut) {
      await ctx.runMutation(internal.workflowEngine.advanceBranchStepMutation, {
        executionId: args.executionId, stepId: args.stepId, status: "skipped", error: "Contact has opted out of SMS (DND)",
      });
      return;
    }

    const org = await ctx.runQuery(internal.workflowEngine.getOrganization, {
      organizationId: execution.organizationId,
    });

    const primaryPhone = contact.phoneNumbers.find((p) => p.isPrimary) || contact.phoneNumbers[0];
    if (!primaryPhone) {
      await ctx.runMutation(internal.workflowEngine.advanceBranchStepMutation, {
        executionId: args.executionId, stepId: args.stepId, status: "skipped", error: "Contact has no phone number",
      });
      return;
    }

    const message = resolveTemplate(step.config.messageTemplate || "", { contact, organization: org });
    if (!message.trim()) {
      await ctx.runMutation(internal.workflowEngine.advanceBranchStepMutation, {
        executionId: args.executionId, stepId: args.stepId, status: "skipped", error: "Empty message template",
      });
      return;
    }

    const phoneNumber = await ctx.runQuery(internal.workflowEngine.getOrgPhoneNumber, {
      organizationId: execution.organizationId,
    });
    if (!phoneNumber) {
      await ctx.runMutation(internal.workflowEngine.advanceBranchStepMutation, {
        executionId: args.executionId, stepId: args.stepId, status: "skipped", error: "No Twilio phone number configured",
      });
      return;
    }

    try {
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

      await ctx.runMutation(internal.workflowEngine.storeOutboundSms, {
        organizationId: execution.organizationId,
        contactId: execution.contactId,
        to: primaryPhone.number,
        from: phoneNumber.phoneNumber,
        body: message,
        workflowExecutionId: args.executionId,
      });

      await ctx.runMutation(internal.workflowEngine.advanceBranchStepMutation, {
        executionId: args.executionId, stepId: args.stepId, status: "completed",
      });
    } catch (error: any) {
      await ctx.runMutation(internal.workflowEngine.advanceBranchStepMutation, {
        executionId: args.executionId, stepId: args.stepId, status: "failed", error: error.message || "SMS send failed",
      });
    }
  },
});

/** Advance branch step (called from actions) */
export const advanceBranchStepMutation = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    stepId: v.string(),
    status: v.union(v.literal("completed"), v.literal("failed"), v.literal("skipped")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await advanceBranchStep(ctx, args.executionId, args.stepId, args.status, args.error);
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
