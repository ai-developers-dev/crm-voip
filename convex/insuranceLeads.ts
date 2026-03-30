import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { authorizeOrgMember } from "./lib/auth";

/** Internal: delete a lead without auth (for admin cleanup) */
export const internalRemove = internalMutation({
  args: { id: v.id("insuranceLeads") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// ── Queries ──────────────────────────────────────────────────────────

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const q = ctx.db
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

    const eligible = leads.filter((l) => l.quoteTypes.includes(args.type));

    const ids = eligible.map((l) => l._id);
    const existingQuotes = await Promise.all(
      ids.map((id) =>
        ctx.db
          .query("insuranceQuotes")
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
    await authorizeOrgMember(ctx, args.organizationId);

    // Dedup: check email, then phone, then name+dob+zip
    if (args.email) {
      const existing = await ctx.db
        .query("insuranceLeads")
        .withIndex("by_organizationId_email", (q) =>
          q.eq("organizationId", args.organizationId).eq("email", args.email!)
        )
        .first();
      if (existing) return existing._id;
    }

    if (args.phone) {
      const phoneNorm = args.phone.replace(/\D/g, "");
      const byPhone = await ctx.db
        .query("insuranceLeads")
        .withIndex("by_organizationId_phone", (q) =>
          q.eq("organizationId", args.organizationId).eq("phone", args.phone!)
        )
        .first();
      // Also check normalized phone in case formatting differs
      if (!byPhone) {
        const allLeads = await ctx.db
          .query("insuranceLeads")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .collect();
        const match = allLeads.find(
          (l) => l.phone && l.phone.replace(/\D/g, "") === phoneNorm
        );
        if (match) return match._id;
      } else {
        return byPhone._id;
      }
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
    const lead = await ctx.db.get(args.id);
    if (!lead) throw new Error("Insurance lead not found");
    await authorizeOrgMember(ctx, lead.organizationId);

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
    const lead = await ctx.db.get(args.id);
    if (!lead) throw new Error("Insurance lead not found");
    await authorizeOrgMember(ctx, lead.organizationId);

    const { id, ...fields } = args;
    const patch: Record<string, any> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("insuranceLeads") },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.id);
    if (!lead) throw new Error("Insurance lead not found");
    await authorizeOrgMember(ctx, lead.organizationId);

    await ctx.db.delete(args.id);
  },
});
