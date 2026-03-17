import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { normalizePhone } from "./lib/phone";
import { authorizeOrgMember, authorizeOrgAdmin } from "./lib/auth";
import { checkContactLimit } from "./lib/planLimits";

// Phone number validator used across all contact mutations
const phoneNumberValidator = v.object({
  number: v.string(),
  type: v.union(v.literal("mobile"), v.literal("work"), v.literal("home")),
  isPrimary: v.boolean(),
});

// ======================
// QUERIES
// ======================

// Get all contacts for an organization (sorted by name)
export const getByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    // Optional: filter to only contacts assigned to this user (for agent role)
    assignedToUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    let contacts;
    if (args.assignedToUserId) {
      // Agent view: only assigned contacts
      contacts = await ctx.db
        .query("contacts")
        .withIndex("by_assigned_user", (q) => q.eq("assignedUserId", args.assignedToUserId))
        .collect();
      // Also include unassigned contacts in same org
      const unassigned = await ctx.db
        .query("contacts")
        .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
        .collect();
      const assignedIds = new Set(contacts.map((c) => c._id));
      for (const c of unassigned) {
        if (!c.assignedUserId && !assignedIds.has(c._id)) {
          contacts.push(c);
        }
      }
    } else {
      // Admin/supervisor view: all contacts
      contacts = await ctx.db
        .query("contacts")
        .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
        .collect();
    }

    // Sort by firstName, then lastName
    return contacts.sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName || ""}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName || ""}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  },
});

// Get a single contact by ID
export const getById = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.contactId);
  },
});

// Lookup contact by phone number (for caller ID integration)
export const lookupByPhone = query({
  args: {
    organizationId: v.id("organizations"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const normalized = normalizePhone(args.phoneNumber);
    return (
      contacts.find((c) =>
        c.phoneNumbers.some(
          (p) => normalizePhone(p.number) === normalized
        )
      ) || null
    );
  },
});

// ======================
// MUTATIONS
// ======================

// Create a new contact
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    company: v.optional(v.string()),
    email: v.optional(v.string()),
    streetAddress: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    phoneNumbers: v.array(phoneNumberValidator),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.string()),
    maritalStatus: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.id("contactTags"))),
    assignedUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    await checkContactLimit(ctx, args.organizationId);
    // Validate that at least one phone number is provided
    if (!args.phoneNumbers || args.phoneNumbers.length === 0) {
      throw new Error("At least one phone number is required");
    }

    // Validate that exactly one phone is marked as primary
    const primaryCount = args.phoneNumbers.filter((p) => p.isPrimary).length;
    if (primaryCount === 0) {
      throw new Error("One phone number must be marked as primary");
    }
    if (primaryCount > 1) {
      throw new Error("Only one phone number can be marked as primary");
    }

    const now = Date.now();
    const contactId = await ctx.db.insert("contacts", {
      organizationId: args.organizationId,
      firstName: args.firstName,
      lastName: args.lastName,
      company: args.company,
      email: args.email,
      streetAddress: args.streetAddress,
      city: args.city,
      state: args.state,
      zipCode: args.zipCode,
      phoneNumbers: args.phoneNumbers,
      dateOfBirth: args.dateOfBirth,
      gender: args.gender,
      maritalStatus: args.maritalStatus,
      notes: args.notes,
      tags: args.tags,
      assignedUserId: args.assignedUserId,
      createdAt: now,
      updatedAt: now,
    });

    // Trigger workflow: contact_created
    await ctx.scheduler.runAfter(0, internal.workflowEngine.checkTriggers, {
      organizationId: args.organizationId,
      triggerType: "contact_created",
      contactId,
    });

    return contactId;
  },
});

// Update an existing contact
export const update = mutation({
  args: {
    contactId: v.id("contacts"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    company: v.optional(v.string()),
    email: v.optional(v.string()),
    streetAddress: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    phoneNumbers: v.optional(v.array(phoneNumberValidator)),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.string()),
    maritalStatus: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.id("contactTags"))),
    assignedUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) {
      throw new Error("Contact not found");
    }
    await authorizeOrgMember(ctx, contact.organizationId);

    // Validate phone numbers if provided
    if (args.phoneNumbers) {
      if (args.phoneNumbers.length === 0) {
        throw new Error("At least one phone number is required");
      }

      const primaryCount = args.phoneNumbers.filter((p) => p.isPrimary).length;
      if (primaryCount === 0) {
        throw new Error("One phone number must be marked as primary");
      }
      if (primaryCount > 1) {
        throw new Error("Only one phone number can be marked as primary");
      }
    }

    const { contactId, ...updates } = args;

    // Remove undefined values
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }

    // Track old tags for workflow triggers
    const oldTags = contact.tags || [];

    await ctx.db.patch(contactId, {
      ...cleanUpdates,
      updatedAt: Date.now(),
    });

    // Trigger workflow: tag_added (for each newly added tag)
    if (args.tags) {
      const newTags = args.tags.filter((t) => !oldTags.includes(t));
      for (const tagId of newTags) {
        await ctx.scheduler.runAfter(0, internal.workflowEngine.checkTriggers, {
          organizationId: contact.organizationId,
          triggerType: "tag_added",
          contactId,
          triggerData: { tagId },
        });
      }
    }

    return contactId;
  },
});

// Delete a contact
export const remove = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) {
      throw new Error("Contact not found");
    }
    await authorizeOrgMember(ctx, contact.organizationId);

    await ctx.db.delete(args.contactId);
    return { success: true };
  },
});

// Get communications history for a contact (calls + messages)
export const getCommunicationsHistory = query({
  args: {
    contactId: v.id("contacts"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) {
      return { calls: [], messages: [] };
    }

    // Get all phone numbers for the contact (normalized to last 10 digits)
    const contactPhones = contact.phoneNumbers.map((p) =>
      normalizePhone(p.number)
    );

    // Fetch calls, messages, and emails in parallel
    const [allCalls, allMessages, contactEmails] = await Promise.all([
      ctx.db
        .query("callHistory")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .order("desc")
        .collect(),
      ctx.db
        .query("messages")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .order("desc")
        .collect(),
      // Get emails linked to this contact
      ctx.db
        .query("emails")
        .withIndex("by_contact", (q) =>
          q.eq("contactId", args.contactId)
        )
        .order("desc")
        .take(100),
    ]);

    // Filter calls by contactId or phone number match
    const seenCallSids = new Set<string>();
    const calls = allCalls.filter((call) => {
      // Deduplicate by twilioCallSid
      if (seenCallSids.has(call.twilioCallSid)) return false;

      // Check if linked by contactId
      if (call.contactId && call.contactId === args.contactId) {
        seenCallSids.add(call.twilioCallSid);
        return true;
      }

      // Check phone number match (from or to)
      const fromNormalized = normalizePhone(call.from);
      const toNormalized = normalizePhone(call.to);

      if (
        contactPhones.includes(fromNormalized) ||
        contactPhones.includes(toNormalized)
      ) {
        seenCallSids.add(call.twilioCallSid);
        return true;
      }

      return false;
    });

    // Filter messages by contactId or phone number match
    const seenMessageSids = new Set<string>();
    const messages = allMessages.filter((msg) => {
      // Deduplicate by twilioMessageSid
      if (seenMessageSids.has(msg.twilioMessageSid)) return false;

      // Check if linked by contactId
      if (msg.contactId && msg.contactId === args.contactId) {
        seenMessageSids.add(msg.twilioMessageSid);
        return true;
      }

      // Check phone number match (from or to)
      const fromNormalized = normalizePhone(msg.from);
      const toNormalized = normalizePhone(msg.to);

      if (
        contactPhones.includes(fromNormalized) ||
        contactPhones.includes(toNormalized)
      ) {
        seenMessageSids.add(msg.twilioMessageSid);
        return true;
      }

      return false;
    });

    // Also match emails by contact email address (if not already linked by contactId)
    let emails = contactEmails;
    if (contact.email) {
      const emailsByAddress = await ctx.db
        .query("emails")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .order("desc")
        .collect();

      const contactEmailLower = contact.email.toLowerCase();
      const seenEmailIds = new Set(contactEmails.map((e) => e._id));
      const additionalEmails = emailsByAddress.filter((e) => {
        if (seenEmailIds.has(e._id)) return false;
        return (
          e.from.toLowerCase() === contactEmailLower ||
          e.to.some((addr) => addr.toLowerCase() === contactEmailLower)
        );
      });
      emails = [...contactEmails, ...additionalEmails];
    }

    // Trim to 100 each
    const trimmedMessages = messages.slice(0, 100);
    const trimmedCalls = calls.slice(0, 100);
    const trimmedEmails = emails.slice(0, 100);

    // Enrich workflow data for messages that came from workflows
    const workflowExecutionIds = new Set<string>();
    for (const msg of trimmedMessages) {
      if (msg.workflowExecutionId) workflowExecutionIds.add(msg.workflowExecutionId);
    }

    const workflowInfoMap: Record<string, { workflowName: string; workflowId: string; nextStepLabel: string | null; executionStatus: string }> = {};
    if (workflowExecutionIds.size > 0) {
      const executions = await Promise.all(
        Array.from(workflowExecutionIds).map((id) =>
          ctx.db.get(id as Id<"workflowExecutions">)
        )
      );
      const workflowIds = new Set<Id<"workflows">>();
      for (const ex of executions) {
        if (ex?.workflowId) workflowIds.add(ex.workflowId);
      }
      const workflows = await Promise.all(
        Array.from(workflowIds).map((id) => ctx.db.get(id))
      );
      const wfMap = new Map(workflows.filter(Boolean).map((w) => [w!._id, w!]));

      for (const ex of executions) {
        if (!ex) continue;
        const wf = wfMap.get(ex.workflowId);
        let nextStepLabel: string | null = null;
        if (ex.status === "running") {
          const nextStep = (ex.snapshotSteps as any[])[ex.currentStepIndex];
          if (nextStep) {
            const typeLabels: Record<string, string> = {
              send_sms: "Send SMS", send_email: "Send Email", create_task: "Create Task",
              add_tag: "Add Tag", remove_tag: "Remove Tag", create_note: "Create Note",
              assign_contact: "Assign Contact", wait: "Wait",
            };
            nextStepLabel = `${typeLabels[nextStep.type] || nextStep.type} (step ${ex.currentStepIndex + 1}/${(ex.snapshotSteps as any[]).length})`;
          }
        }
        workflowInfoMap[ex._id] = {
          workflowName: wf?.name || "Unknown Workflow",
          workflowId: ex.workflowId,
          nextStepLabel,
          executionStatus: ex.status,
        };
      }
    }

    // Return limited results (most recent 100 each)
    return {
      calls: trimmedCalls,
      messages: trimmedMessages,
      emails: trimmedEmails,
      workflowInfo: workflowInfoMap,
    };
  },
});

// Toggle email opt-out (freely changeable by users)
export const toggleEmailOptOut = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact not found");

    const newValue = !contact.emailOptedOut;
    await ctx.db.patch(args.contactId, {
      emailOptedOut: newValue,
      ...(newValue ? { emailOptOutDate: Date.now() } : {}),
      updatedAt: Date.now(),
    });
  },
});

// Toggle voice opt-out (freely changeable by users)
export const toggleVoiceOptOut = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact not found");

    const newValue = !contact.voiceOptedOut;
    await ctx.db.patch(args.contactId, {
      voiceOptedOut: newValue,
      ...(newValue ? { voiceOptOutDate: Date.now() } : {}),
      updatedAt: Date.now(),
    });
  },
});

// Set email opted out (used by webhook/unsubscribe endpoint)
export const setEmailOptedOut = mutation({
  args: { contactId: v.id("contacts"), optedOut: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.contactId, {
      emailOptedOut: args.optedOut,
      ...(args.optedOut ? { emailOptOutDate: Date.now() } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const toggleRead = mutation({
  args: {
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact not found");
    await ctx.db.patch(args.contactId, {
      isRead: !contact.isRead,
      updatedAt: Date.now(),
    });
  },
});
