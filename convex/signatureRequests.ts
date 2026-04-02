import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authorizeOrgMember } from "./lib/auth";

const fieldValidator = v.object({
  id: v.string(),
  type: v.union(v.literal("signature"), v.literal("initials"), v.literal("date"), v.literal("text")),
  page: v.number(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  label: v.optional(v.string()),
  required: v.boolean(),
});

// Generate upload URL for PDFs
export const generateUploadUrl = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    return await ctx.storage.generateUploadUrl();
  },
});

// Get file URL from storage ID
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Create a new signature request (draft)
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    originalPdfStorageId: v.id("_storage"),
    fileName: v.string(),
    fields: v.array(fieldValidator),
    subject: v.optional(v.string()),
    message: v.optional(v.string()),
    createdByUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);

    const now = Date.now();
    const signingToken = crypto.randomUUID();

    return await ctx.db.insert("signatureRequests", {
      organizationId: args.organizationId,
      contactId: args.contactId,
      originalPdfStorageId: args.originalPdfStorageId,
      fileName: args.fileName,
      fields: args.fields,
      status: "draft",
      signingToken,
      subject: args.subject,
      message: args.message,
      createdByUserId: args.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update a draft signature request (fields, subject, message)
export const update = mutation({
  args: {
    id: v.id("signatureRequests"),
    fields: v.optional(v.array(fieldValidator)),
    subject: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Signature request not found");
    if (request.status !== "draft") throw new Error("Can only edit draft requests");
    await authorizeOrgMember(ctx, request.organizationId);

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.fields !== undefined) updates.fields = args.fields;
    if (args.subject !== undefined) updates.subject = args.subject;
    if (args.message !== undefined) updates.message = args.message;

    await ctx.db.patch(args.id, updates);
  },
});

// Mark as sent (after email is sent)
export const markSent = mutation({
  args: {
    id: v.id("signatureRequests"),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Signature request not found");
    if (request.status !== "draft") throw new Error("Can only send draft requests");
    await authorizeOrgMember(ctx, request.organizationId);

    await ctx.db.patch(args.id, {
      status: "sent",
      sentAt: Date.now(),
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
    });
  },
});

// Public: get by signing token (no auth required — for contact signing page)
export const getByToken = query({
  args: { signingToken: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("signatureRequests")
      .withIndex("by_token", (q) => q.eq("signingToken", args.signingToken))
      .first();

    if (!request) return null;

    // Get the PDF URL
    const pdfUrl = await ctx.storage.getUrl(request.originalPdfStorageId);

    // Get contact name
    const contact = await ctx.db.get(request.contactId);

    return {
      ...request,
      pdfUrl,
      contactName: contact
        ? `${contact.firstName}${contact.lastName ? " " + contact.lastName : ""}`
        : "Unknown",
    };
  },
});

// Public: mark as viewed (no auth)
export const markViewed = mutation({
  args: { signingToken: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("signatureRequests")
      .withIndex("by_token", (q) => q.eq("signingToken", args.signingToken))
      .first();

    if (!request) throw new Error("Not found");
    if (request.status === "sent") {
      await ctx.db.patch(request._id, {
        status: "viewed",
        viewedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

// Public: complete signing (no auth — contact submits signed PDF)
export const complete = mutation({
  args: {
    signingToken: v.string(),
    signedPdfStorageId: v.id("_storage"),
    signerName: v.string(),
    signerIp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("signatureRequests")
      .withIndex("by_token", (q) => q.eq("signingToken", args.signingToken))
      .first();

    if (!request) throw new Error("Not found");
    if (request.status !== "sent" && request.status !== "viewed") {
      throw new Error("This document cannot be signed");
    }
    if (request.expiresAt && Date.now() > request.expiresAt) {
      await ctx.db.patch(request._id, { status: "expired", updatedAt: Date.now() });
      throw new Error("This signing request has expired");
    }

    await ctx.db.patch(request._id, {
      status: "signed",
      signedPdfStorageId: args.signedPdfStorageId,
      signedAt: Date.now(),
      signerName: args.signerName,
      signerIp: args.signerIp,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Public: generate upload URL for signed PDF (no auth — contact uploads)
export const generateSignedUploadUrl = mutation({
  args: { signingToken: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("signatureRequests")
      .withIndex("by_token", (q) => q.eq("signingToken", args.signingToken))
      .first();

    if (!request) throw new Error("Not found");
    if (request.status !== "sent" && request.status !== "viewed") {
      throw new Error("This document cannot be signed");
    }

    return await ctx.storage.generateUploadUrl();
  },
});

// Public: decline signing (no auth)
export const decline = mutation({
  args: { signingToken: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("signatureRequests")
      .withIndex("by_token", (q) => q.eq("signingToken", args.signingToken))
      .first();

    if (!request) throw new Error("Not found");
    await ctx.db.patch(request._id, {
      status: "declined",
      updatedAt: Date.now(),
    });
  },
});

// Agent: void a sent request
export const voidRequest = mutation({
  args: { id: v.id("signatureRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Not found");
    await authorizeOrgMember(ctx, request.organizationId);

    await ctx.db.patch(args.id, {
      status: "voided",
      updatedAt: Date.now(),
    });
  },
});

// List signature requests for org
export const list = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);

    let requests;
    if (args.status) {
      requests = await ctx.db
        .query("signatureRequests")
        .withIndex("by_status", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", args.status as "draft" | "sent" | "viewed" | "signed" | "declined" | "expired" | "voided")
        )
        .collect();
    } else {
      requests = await ctx.db
        .query("signatureRequests")
        .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
        .collect();
    }

    // Batch fetch contacts
    const contactIds = [...new Set(requests.map((r) => r.contactId))];
    const contacts = await Promise.all(contactIds.map((id) => ctx.db.get(id)));
    const contactMap = new Map(contacts.filter(Boolean).map((c) => [c!._id, c!]));

    return requests
      .map((r) => {
        const contact = contactMap.get(r.contactId);
        return {
          ...r,
          contactName: contact
            ? `${contact.firstName}${contact.lastName ? " " + contact.lastName : ""}`
            : "Unknown",
          contactEmail: contact?.email,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Get single request by ID
export const getById = query({
  args: { id: v.id("signatureRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request) return null;
    await authorizeOrgMember(ctx, request.organizationId);

    const [pdfUrl, signedPdfUrl, contact] = await Promise.all([
      ctx.storage.getUrl(request.originalPdfStorageId),
      request.signedPdfStorageId ? ctx.storage.getUrl(request.signedPdfStorageId) : null,
      ctx.db.get(request.contactId),
    ]);

    return {
      ...request,
      pdfUrl,
      signedPdfUrl,
      contactName: contact
        ? `${contact.firstName}${contact.lastName ? " " + contact.lastName : ""}`
        : "Unknown",
      contactEmail: contact?.email,
    };
  },
});
