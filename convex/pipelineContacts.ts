import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const getByPipeline = query({
  args: { pipelineId: v.id("pipelines") },
  handler: async (ctx, args) => {
    const pipelineContacts = await ctx.db
      .query("pipelineContacts")
      .withIndex("by_pipeline", (q) => q.eq("pipelineId", args.pipelineId))
      .collect();

    // Batch fetch contacts and tags
    const contactIds = [...new Set(pipelineContacts.map((pc) => pc.contactId))];
    const contacts = await Promise.all(contactIds.map((id) => ctx.db.get(id)));
    const contactMap = new Map(contacts.filter(Boolean).map((c) => [c!._id, c!]));

    // Fetch all tags referenced by contacts
    const allTagIds = new Set<Id<"contactTags">>();
    for (const c of contacts) {
      if (c?.tags) c.tags.forEach((t) => allTagIds.add(t));
    }
    const tags = await Promise.all([...allTagIds].map((id) => ctx.db.get(id)));
    const tagMap = new Map(tags.filter(Boolean).map((t) => [t!._id, t!]));

    return pipelineContacts.map((pc) => {
      const contact = contactMap.get(pc.contactId);
      const primaryPhone = contact?.phoneNumbers?.find((p) => p.isPrimary) || contact?.phoneNumbers?.[0];
      const contactTags = (contact?.tags || [])
        .map((tagId) => tagMap.get(tagId))
        .filter(Boolean)
        .map((t) => ({ id: t!._id, name: t!.name, color: t!.color }));
      return {
        ...pc,
        contactName: contact ? `${contact.firstName} ${contact.lastName || ""}`.trim() : "Unknown",
        contactPhone: primaryPhone?.number || "",
        contactEmail: contact?.email || "",
        contactTags,
      };
    });
  },
});

export const getByStage = query({
  args: { stageId: v.id("pipelineStages") },
  handler: async (ctx, args) => {
    const pipelineContacts = await ctx.db
      .query("pipelineContacts")
      .withIndex("by_stage", (q) => q.eq("stageId", args.stageId))
      .collect();

    const contacts = await Promise.all(
      pipelineContacts.map((pc) => ctx.db.get(pc.contactId))
    );
    const contactMap = new Map(contacts.filter(Boolean).map((c) => [c!._id, c!]));

    return pipelineContacts.map((pc) => {
      const contact = contactMap.get(pc.contactId);
      const primaryPhone = contact?.phoneNumbers?.find((p) => p.isPrimary) || contact?.phoneNumbers?.[0];
      return {
        ...pc,
        contactName: contact ? `${contact.firstName} ${contact.lastName || ""}`.trim() : "Unknown",
        contactPhone: primaryPhone?.number || "",
      };
    });
  },
});

export const addToPipeline = mutation({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
    stageId: v.id("pipelineStages"),
    contactId: v.id("contacts"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if contact is already in this pipeline
    const existing = await ctx.db
      .query("pipelineContacts")
      .withIndex("by_pipeline", (q) => q.eq("pipelineId", args.pipelineId))
      .collect();
    const already = existing.find((pc) => pc.contactId === args.contactId);
    if (already) throw new Error("Contact is already in this pipeline");

    const now = Date.now();
    return await ctx.db.insert("pipelineContacts", {
      organizationId: args.organizationId,
      pipelineId: args.pipelineId,
      stageId: args.stageId,
      contactId: args.contactId,
      enteredStageAt: now,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const moveToStage = mutation({
  args: {
    id: v.id("pipelineContacts"),
    organizationId: v.id("organizations"),
    toStageId: v.id("pipelineStages"),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Pipeline contact not found");

    const fromStageId = record.stageId;
    if (fromStageId === args.toStageId) return; // No-op

    const now = Date.now();
    await ctx.db.patch(args.id, {
      stageId: args.toStageId,
      enteredStageAt: now,
      updatedAt: now,
    });

    // Trigger workflow
    await ctx.scheduler.runAfter(0, internal.workflowEngine.checkTriggers, {
      organizationId: args.organizationId,
      triggerType: "pipeline_stage_entered",
      contactId: record.contactId,
      triggerData: {
        pipelineId: record.pipelineId,
        stageId: args.toStageId,
        fromStageId,
      },
    });
  },
});

export const removeFromPipeline = mutation({
  args: { id: v.id("pipelineContacts") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
