/**
 * ─────────────────────────────────────────────────────────────
 * MERGE INTO: convex/schema.ts
 * WHERE: Inside defineSchema({ ... }) — add BEFORE the closing });
 * ─────────────────────────────────────────────────────────────
 *
 * Also add this import at the top of schema.ts if not already present:
 *   import { defineSchema, defineTable } from "convex/server";
 *   import { v } from "convex/values";
 */

// ── Insurance Leads ──────────────────────────────────────────────────
insuranceLeads: defineTable({
  organizationId: v.id("organizations"),
  // Contact
  firstName: v.string(),
  lastName: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  // Personal
  dob: v.string(),                    // "YYYY-MM-DD"
  gender: v.optional(v.string()),
  maritalStatus: v.optional(v.string()),
  // Address
  street: v.string(),
  city: v.string(),
  state: v.string(),                  // 2-letter e.g. "IL"
  zip: v.string(),
  // What to quote
  quoteTypes: v.array(v.string()),    // ["auto", "home"]
  // Auto data
  vehicles: v.optional(v.array(v.object({
    year: v.number(),
    make: v.string(),
    model: v.string(),
    vin: v.optional(v.string()),
    primaryUse: v.optional(v.string()), // "commute" | "pleasure" | "business"
  }))),
  // Home data
  property: v.optional(v.object({
    yearBuilt: v.optional(v.number()),
    sqft: v.optional(v.number()),
    constructionType: v.optional(v.string()),
    ownershipType: v.optional(v.string()), // "own" | "rent"
  })),
  status: v.string(),                 // "new" | "quoting" | "quoted" | "error"
  notes: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_organizationId", ["organizationId"])
  .index("by_organizationId_status", ["organizationId", "status"]),

// ── Insurance Quotes ─────────────────────────────────────────────────
quotes: defineTable({
  organizationId: v.id("organizations"),
  insuranceLeadId: v.id("insuranceLeads"),
  portal: v.string(),                 // "natgen" | "progressive" | "travelers" etc.
  type: v.string(),                   // "auto" | "home"
  status: v.string(),                 // "pending" | "success" | "error"
  // Quote result (populated on success)
  carrier: v.optional(v.string()),
  quoteId: v.optional(v.string()),
  monthlyPremium: v.optional(v.number()),
  annualPremium: v.optional(v.number()),
  coverageDetails: v.optional(v.any()),
  // Error info
  errorMessage: v.optional(v.string()),
  quotedAt: v.number(),
})
  .index("by_organizationId", ["organizationId"])
  .index("by_lead", ["insuranceLeadId"])
  .index("by_organizationId_status", ["organizationId", "status"]),
