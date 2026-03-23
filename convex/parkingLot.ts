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

// Clear a parking slot by conference name (when caller hangs up)
export const clearByConference = mutation({
  args: {
    conferenceName: v.string(),
  },
  handler: async (ctx, args) => {
    // Find parking slot by conference name
    const slots = await ctx.db
      .query("parkingLots")
      .filter((q) => q.eq(q.field("conferenceName"), args.conferenceName))
      .collect();

    if (slots.length === 0) {
      return { success: false, reason: "not_found" };
    }

    const slot = slots[0];

    // Get the active call if exists
    const activeCall = slot.activeCallId ? await ctx.db.get(slot.activeCallId) : null;

    // Move call to history if it exists
    if (activeCall) {
      const talkTimeSeconds = activeCall.answeredAt
        ? Math.floor((Date.now() - activeCall.answeredAt) / 1000)
        : 0;

      await ctx.db.insert("callHistory", {
        organizationId: activeCall.organizationId,
        twilioCallSid: activeCall.twilioCallSid,
        direction: activeCall.direction,
        from: activeCall.from,
        fromName: activeCall.fromName,
        to: activeCall.to,
        toName: activeCall.toName,
        outcome: "answered",
        handledByUserId: activeCall.assignedUserId,
        startedAt: activeCall.startedAt,
        answeredAt: activeCall.answeredAt,
        endedAt: Date.now(),
        duration: talkTimeSeconds,
        notes: activeCall.notes,
      });

      // Delete the active call
      await ctx.db.delete(activeCall._id);
    }

    // Clear the parking slot
    await ctx.db.patch(slot._id, {
      isOccupied: false,
      activeCallId: undefined,
      parkedByUserId: undefined,
      parkedAt: undefined,
      conferenceName: undefined,
      pstnCallSid: undefined,
      callerNumber: undefined,
      callerName: undefined,
    });

    return { success: true, slotNumber: slot.slotNumber };
  },
});

/** Auto-park an unanswered call into the first available slot */
export const autopark = mutation({
  args: {
    organizationId: v.id("organizations"),
    conferenceName: v.string(),
    pstnCallSid: v.string(),
    callerNumber: v.string(),
    callerName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find first empty slot
    const slots = await ctx.db
      .query("parkingLots")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    let emptySlot = slots.find((s) => !s.isOccupied);

    // If no slots exist, initialize them
    if (slots.length === 0) {
      for (let i = 1; i <= 10; i++) {
        const id = await ctx.db.insert("parkingLots", {
          organizationId: args.organizationId,
          slotNumber: i,
          isOccupied: false,
        });
        if (i === 1) emptySlot = (await ctx.db.get(id)) ?? undefined;
      }
    }

    if (!emptySlot) {
      return { success: false, reason: "All parking slots full" };
    }

    await ctx.db.patch(emptySlot._id, {
      isOccupied: true,
      conferenceName: args.conferenceName,
      pstnCallSid: args.pstnCallSid,
      callerNumber: args.callerNumber,
      callerName: args.callerName,
      parkedAt: Date.now(),
    });

    return { success: true, slotNumber: emptySlot.slotNumber };
  },
});
