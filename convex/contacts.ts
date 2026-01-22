import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

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

// Search contacts by phone number (for caller ID)
export const searchByPhone = query({
  args: {
    organizationId: v.id("organizations"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Normalize the search phone number (remove non-digits, get last 10 digits)
    const normalized = args.phoneNumber.replace(/\D/g, "").slice(-10);

    // Find contact with matching phone number
    return (
      contacts.find((c) =>
        c.phoneNumbers.some(
          (p) => p.number.replace(/\D/g, "").slice(-10) === normalized
        )
      ) || null
    );
  },
});

// Lookup contact by phone number (alias for caller ID integration)
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

    const normalized = args.phoneNumber.replace(/\D/g, "").slice(-10);
    return (
      contacts.find((c) =>
        c.phoneNumbers.some(
          (p) => p.number.replace(/\D/g, "").slice(-10) === normalized
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
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    assignedUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
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
    return await ctx.db.insert("contacts", {
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
      notes: args.notes,
      tags: args.tags,
      assignedUserId: args.assignedUserId,
      createdAt: now,
      updatedAt: now,
    });
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
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    assignedUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) {
      throw new Error("Contact not found");
    }

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

    await ctx.db.patch(contactId, {
      ...cleanUpdates,
      updatedAt: Date.now(),
    });

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

    await ctx.db.delete(args.contactId);
    return { success: true };
  },
});
