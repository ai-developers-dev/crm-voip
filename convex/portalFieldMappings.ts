import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const fieldValidator = v.object({
  selector: v.string(),
  tag: v.string(),
  type: v.string(),
  label: v.optional(v.string()),
  id: v.optional(v.string()),
  name: v.optional(v.string()),
  contactField: v.optional(v.string()),
  defaultValue: v.optional(v.string()),
  selectedValue: v.optional(v.string()),
  transform: v.optional(v.string()),
  required: v.optional(v.boolean()),
  options: v.optional(v.array(v.object({
    value: v.string(),
    text: v.string(),
  }))),
});

const screenValidator = v.object({
  name: v.string(),
  order: v.number(),
  url: v.optional(v.string()),
  pageSource: v.optional(v.string()), // backward compat — new sources go to portalPageSources
  action: v.optional(v.string()),
  nextButton: v.optional(v.string()),
  sidebarLink: v.optional(v.string()),
  waitAfterNext: v.optional(v.number()),
  progressStage: v.optional(v.string()),
  fields: v.array(fieldValidator),
});

const sourceValidator = v.object({
  screenName: v.string(),
  screenOrder: v.number(),
  pageSource: v.string(),
  url: v.optional(v.string()),
});

// Save or update field mappings + page sources for a carrier + quote type
export const save = mutation({
  args: {
    carrierId: v.id("agencyCarriers"),
    quoteType: v.string(),
    screens: v.array(screenValidator),
    sources: v.optional(v.array(sourceValidator)),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("portalFieldMappings")
      .withIndex("by_carrier_quote_type", (q) =>
        q.eq("carrierId", args.carrierId).eq("quoteType", args.quoteType)
      )
      .first();

    const now = Date.now();
    let mappingId;

    if (existing) {
      await ctx.db.patch(existing._id, {
        screens: args.screens,
        updatedAt: now,
      });
      mappingId = existing._id;
    } else {
      mappingId = await ctx.db.insert("portalFieldMappings", {
        carrierId: args.carrierId,
        quoteType: args.quoteType,
        screens: args.screens,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Save page sources separately (delete old ones first)
    if (args.sources && args.sources.length > 0) {
      const oldSources = await ctx.db
        .query("portalPageSources")
        .withIndex("by_mapping", (q) => q.eq("mappingId", mappingId))
        .collect();
      for (const old of oldSources) {
        await ctx.db.delete(old._id);
      }
      for (const source of args.sources) {
        await ctx.db.insert("portalPageSources", {
          mappingId,
          screenName: source.screenName,
          screenOrder: source.screenOrder,
          pageSource: source.pageSource,
          url: source.url,
          capturedAt: now,
        });
      }
    }

    return mappingId;
  },
});

// Get field mappings for a carrier + quote type
export const getByCarrierAndType = query({
  args: {
    carrierId: v.id("agencyCarriers"),
    quoteType: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("portalFieldMappings")
      .withIndex("by_carrier_quote_type", (q) =>
        q.eq("carrierId", args.carrierId).eq("quoteType", args.quoteType)
      )
      .first();
  },
});

// One-shot repair: strip " insurance" suffix + lowercase all quoteType values.
// Field-mapper UI saved some as "auto insurance" but agent looks up "auto".
export const normalizeQuoteTypes = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("portalFieldMappings").collect();
    const updated: Array<{ id: string; from: string; to: string }> = [];
    for (const m of all) {
      const cleaned = m.quoteType
        .toLowerCase()
        .replace(/\s+insurance$/i, "")
        .trim();
      if (cleaned !== m.quoteType) {
        await ctx.db.patch(m._id, { quoteType: cleaned });
        updated.push({ id: m._id, from: m.quoteType, to: cleaned });
      }
    }
    return { updatedCount: updated.length, updated };
  },
});

// Get by ID (for the mapping-driven runner)
export const getById = query({
  args: { mappingId: v.id("portalFieldMappings") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.mappingId);
  },
});

// Update screens for an existing mapping (edit mode)
export const updateFields = mutation({
  args: {
    mappingId: v.id("portalFieldMappings"),
    screens: v.array(screenValidator),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mappingId, {
      screens: args.screens,
      updatedAt: Date.now(),
    });
  },
});

// Delete a mapping (and its sources)
export const remove = mutation({
  args: { mappingId: v.id("portalFieldMappings") },
  handler: async (ctx, args) => {
    // Delete page sources first
    const sources = await ctx.db
      .query("portalPageSources")
      .withIndex("by_mapping", (q) => q.eq("mappingId", args.mappingId))
      .collect();
    for (const s of sources) {
      await ctx.db.delete(s._id);
    }
    await ctx.db.delete(args.mappingId);
  },
});

// Get all mappings for a carrier
export const getByCarrier = query({
  args: { carrierId: v.id("agencyCarriers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("portalFieldMappings")
      .withIndex("by_carrier", (q) => q.eq("carrierId", args.carrierId))
      .collect();
  },
});

// Get page sources for a mapping
export const getSourcesForMapping = query({
  args: { mappingId: v.id("portalFieldMappings") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("portalPageSources")
      .withIndex("by_mapping", (q) => q.eq("mappingId", args.mappingId))
      .collect();
  },
});
