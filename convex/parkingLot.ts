import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Query to get all parking slots for an organization
export const getSlots = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const slots = await ctx.db
      .query("parkingLots")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Get call details for occupied slots
    const slotsWithCalls = await Promise.all(
      slots.map(async (slot) => {
        if (slot.activeCallId) {
          const call = await ctx.db.get(slot.activeCallId);
          return { ...slot, call };
        }
        return { ...slot, call: null };
      })
    );

    return slotsWithCalls;
  },
});

// Query to get a specific parking slot
export const getSlot = query({
  args: {
    organizationId: v.id("organizations"),
    slotNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const slot = await ctx.db
      .query("parkingLots")
      .withIndex("by_organization_slot", (q) =>
        q.eq("organizationId", args.organizationId).eq("slotNumber", args.slotNumber)
      )
      .first();

    if (slot?.activeCallId) {
      const call = await ctx.db.get(slot.activeCallId);
      return { ...slot, call };
    }

    return slot ? { ...slot, call: null } : null;
  },
});

// Initialize parking slots for an organization
export const initialize = mutation({
  args: {
    organizationId: v.id("organizations"),
    numSlots: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numSlots = args.numSlots || 10;

    // Check if slots already exist
    const existing = await ctx.db
      .query("parkingLots")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .first();

    if (existing) {
      return { message: "Parking slots already initialized" };
    }

    // Create parking slots
    for (let i = 1; i <= numSlots; i++) {
      await ctx.db.insert("parkingLots", {
        organizationId: args.organizationId,
        slotNumber: i,
        isOccupied: false,
      });
    }

    return { message: `Created ${numSlots} parking slots` };
  },
});
