import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ── Queries ──────────────────────────────────────────────────────────

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("insuranceLeads")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      );
    const results = await q.order("desc").collect();
    const filtered = args.status ? results.filter((r) => r.status === args.status) : results;
    return filtered.slice(0, args.limit ?? 100);
  },
});

export const getById = query({
  args: { id: v.id("insuranceLeads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Returns leads that haven't been quoted on the given portal+type combo yet,
 * or whose overall status is still "new".
 */
export const getUnquoted = query({
  args: {
    organizationId: v.id("organizations"),
    portal: v.string(),
    type: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const leads = await ctx.db
      .query("insuranceLeads")
      .withIndex("by_organizationId_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "new")
      )
      .order("asc")
      .collect();

    // Filter to only leads that include the requested quote type
    const eligible = leads.filter((l) => l.quoteTypes.includes(args.type));

    // Exclude any that already have a quote for this portal+type
    const ids = eligible.map((l) => l._id);
    const existingQuotes = await Promise.all(
      ids.map((id) =>
        ctx.db
          .query("quotes")
          .withIndex("by_lead", (q) => q.eq("insuranceLeadId", id))
          .collect()
      )
    );

    const alreadyQuoted = new Set<string>();
    existingQuotes.flat().forEach((q) => {
      if (q.portal === args.portal && q.type === args.type && q.status === "success") {
        alreadyQuoted.add(q.insuranceLeadId);
      }
    });

    return eligible
      .filter((l) => !alreadyQuoted.has(l._id))
      .slice(0, args.limit ?? 20);
  },
});

// ── Mutations ────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    dob: v.string(),
    gender: v.optional(v.string()),
    maritalStatus: v.optional(v.string()),
    street: v.string(),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    quoteTypes: v.array(v.string()),
    vehicles: v.optional(v.array(v.object({
      year: v.number(),
      make: v.string(),
      model: v.string(),
      vin: v.optional(v.string()),
      primaryUse: v.optional(v.string()),
    }))),
    property: v.optional(v.object({
      yearBuilt: v.optional(v.number()),
      sqft: v.optional(v.number()),
      constructionType: v.optional(v.string()),
      ownershipType: v.optional(v.string()),
    })),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Dedup: check email, then phone, then name+dob+zip
    if (args.email) {
      const byEmail = await ctx.db
        .query("insuranceLeads")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect();
      const emailLower = args.email.toLowerCase();
      const match = byEmail.find((l) => l.email?.toLowerCase() === emailLower);
      if (match) return match._id;
    }

    if (args.phone) {
      const phoneNorm = args.phone.replace(/\D/g, "");
      const orgLeads = await ctx.db
        .query("insuranceLeads")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect();
      const match = orgLeads.find(
        (l) => l.phone && l.phone.replace(/\D/g, "") === phoneNorm
      );
      if (match) return match._id;
    }

    // Fallback: same person by name + DOB + zip
    const firstLower = args.firstName.toLowerCase().trim();
    const lastLower = args.lastName.toLowerCase().trim();
    const orgLeads = await ctx.db
      .query("insuranceLeads")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const nameMatch = orgLeads.find(
      (l) =>
        l.firstName.toLowerCase().trim() === firstLower &&
        l.lastName.toLowerCase().trim() === lastLower &&
        l.dob === args.dob &&
        l.zip === args.zip
    );
    if (nameMatch) return nameMatch._id;

    const now = Date.now();
    return await ctx.db.insert("insuranceLeads", {
      ...args,
      status: "new",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("insuranceLeads"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("insuranceLeads"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    dob: v.optional(v.string()),
    gender: v.optional(v.string()),
    maritalStatus: v.optional(v.string()),
    street: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    quoteTypes: v.optional(v.array(v.string())),
    vehicles: v.optional(v.array(v.object({
      year: v.number(),
      make: v.string(),
      model: v.string(),
      vin: v.optional(v.string()),
      primaryUse: v.optional(v.string()),
    }))),
    property: v.optional(v.object({
      yearBuilt: v.optional(v.number()),
      sqft: v.optional(v.number()),
      constructionType: v.optional(v.string()),
      ownershipType: v.optional(v.string()),
    })),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const patch: Record<string, any> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("insuranceLeads") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
