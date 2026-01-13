import { mutation, query, internalMutation, internalQuery, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

// Query to get all active calls for an organization
export const getActive = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activeCalls")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => q.neq(q.field("state"), "ended"))
      .collect();
  },
});

// Query to get ringing calls (incoming calls waiting to be answered)
export const getRinging = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activeCalls")
      .withIndex("by_organization_state", (q) =>
        q.eq("organizationId", args.organizationId).eq("state", "ringing")
      )
      .collect();
  },
});

// Query to get parked calls
export const getParked = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activeCalls")
      .withIndex("by_organization_state", (q) =>
        q.eq("organizationId", args.organizationId).eq("state", "parked")
      )
      .collect();
  },
});

// Query to get call by Twilio SID
export const getByTwilioSid = query({
  args: { twilioCallSid: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activeCalls")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .first();
  },
});

// Query to get calls assigned to a user
export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activeCalls")
      .withIndex("by_assigned_user", (q) => q.eq("assignedUserId", args.userId))
      .filter((q) => q.neq(q.field("state"), "ended"))
      .collect();
  },
});

// Internal mutation to create incoming call
export const createIncoming = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    twilioCallSid: v.string(),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("activeCalls", {
      organizationId: args.organizationId,
      twilioCallSid: args.twilioCallSid,
      direction: "inbound",
      from: args.from,
      to: args.to,
      state: "ringing",
      startedAt: Date.now(),
      isRecording: false,
    });
  },
});

// Public mutation to create or get incoming call (for client-side Twilio SDK)
export const createOrGetIncoming = mutation({
  args: {
    organizationId: v.id("organizations"),
    twilioCallSid: v.string(),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if call already exists
    const existing = await ctx.db
      .query("activeCalls")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .first();

    if (existing) {
      return existing._id;
    }

    // Create new incoming call
    return await ctx.db.insert("activeCalls", {
      organizationId: args.organizationId,
      twilioCallSid: args.twilioCallSid,
      direction: "inbound",
      from: args.from,
      to: args.to,
      state: "ringing",
      startedAt: Date.now(),
      isRecording: false,
    });
  },
});

// Internal mutation to update call status from Twilio callback
export const updateStatus = internalMutation({
  args: {
    twilioCallSid: v.string(),
    state: v.string(),
    outcome: v.optional(v.string()),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await updateStatusHandler(ctx, args);
  },
});

// Public mutation for webhook use (API route can call this)
export const updateStatusFromWebhook = mutation({
  args: {
    twilioCallSid: v.string(),
    state: v.string(),
    outcome: v.optional(v.string()),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await updateStatusHandler(ctx, args);
  },
});

// Shared handler for status updates
async function updateStatusHandler(ctx: MutationCtx, args: {
  twilioCallSid: string;
  state: string;
  outcome?: string;
  duration?: number;
}) {
    const call = await ctx.db
      .query("activeCalls")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .first();

    if (!call) return;

    const updates: any = {
      state: args.state,
    };

    if (args.state === "connected" && !call.answeredAt) {
      updates.answeredAt = Date.now();
    }

    if (args.state === "ended") {
      updates.endedAt = Date.now();

      // Move to call history
      await ctx.db.insert("callHistory", {
        organizationId: call.organizationId,
        twilioCallSid: call.twilioCallSid,
        direction: call.direction,
        from: call.from,
        fromName: call.fromName,
        to: call.to,
        toName: call.toName,
        outcome: (args.outcome as any) || "answered",
        handledByUserId: call.assignedUserId,
        startedAt: call.startedAt,
        answeredAt: call.answeredAt,
        endedAt: Date.now(),
        duration: args.duration || 0,
        notes: call.notes,
      });

      // Delete active call
      await ctx.db.delete(call._id);
      return;
    }

    await ctx.db.patch(call._id, updates);
}

// Mutation to answer a call
export const answer = mutation({
  args: {
    callId: v.id("activeCalls"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");

    await ctx.db.patch(args.callId, {
      state: "connected",
      assignedUserId: args.userId,
      answeredAt: Date.now(),
    });

    // Update user status
    await ctx.db.patch(args.userId, {
      status: "on_call",
      updatedAt: Date.now(),
    });

    return call;
  },
});

// Mutation to park a call
export const park = mutation({
  args: {
    callId: v.id("activeCalls"),
    slotNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");

    // Check if slot is available
    const existingSlot = await ctx.db
      .query("parkingLots")
      .withIndex("by_organization_slot", (q) =>
        q.eq("organizationId", call.organizationId).eq("slotNumber", args.slotNumber)
      )
      .first();

    if (existingSlot?.isOccupied) {
      throw new Error("Parking slot is occupied");
    }

    // Update or create parking slot
    if (existingSlot) {
      await ctx.db.patch(existingSlot._id, {
        isOccupied: true,
        activeCallId: args.callId,
        parkedByUserId: call.assignedUserId,
        parkedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("parkingLots", {
        organizationId: call.organizationId,
        slotNumber: args.slotNumber,
        isOccupied: true,
        activeCallId: args.callId,
        parkedByUserId: call.assignedUserId,
        parkedAt: Date.now(),
      });
    }

    // Update call state
    await ctx.db.patch(args.callId, {
      state: "parked",
      parkingSlot: args.slotNumber,
      holdStartedAt: Date.now(),
    });

    // Update user status back to available
    if (call.assignedUserId) {
      await ctx.db.patch(call.assignedUserId, {
        status: "available",
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

// Mutation to retrieve a parked call
export const unpark = mutation({
  args: {
    slotNumber: v.number(),
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const slot = await ctx.db
      .query("parkingLots")
      .withIndex("by_organization_slot", (q) =>
        q.eq("organizationId", args.organizationId).eq("slotNumber", args.slotNumber)
      )
      .first();

    if (!slot || !slot.isOccupied || !slot.activeCallId) {
      throw new Error("No call in this parking slot");
    }

    const call = await ctx.db.get(slot.activeCallId);
    if (!call) throw new Error("Call not found");

    // Update parking slot
    await ctx.db.patch(slot._id, {
      isOccupied: false,
      activeCallId: undefined,
      parkedByUserId: undefined,
      parkedAt: undefined,
    });

    // Update call state
    await ctx.db.patch(slot.activeCallId, {
      state: "connected",
      parkingSlot: undefined,
      assignedUserId: args.userId,
      holdStartedAt: undefined,
    });

    // Update user status
    await ctx.db.patch(args.userId, {
      status: "on_call",
      updatedAt: Date.now(),
    });

    return { success: true, callId: slot.activeCallId };
  },
});

// Mutation to transfer a call
export const transfer = mutation({
  args: {
    callId: v.id("activeCalls"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");

    const previousUserId = call.assignedUserId;

    // Update call
    await ctx.db.patch(args.callId, {
      state: "transferring",
      previousUserId,
      assignedUserId: args.targetUserId,
    });

    // Update previous user status
    if (previousUserId) {
      await ctx.db.patch(previousUserId, {
        status: "available",
        updatedAt: Date.now(),
      });
    }

    // Update target user status
    await ctx.db.patch(args.targetUserId, {
      status: "on_call",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Mutation to end a call
export const end = mutation({
  args: { callId: v.id("activeCalls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");

    // Move to history
    await ctx.db.insert("callHistory", {
      organizationId: call.organizationId,
      twilioCallSid: call.twilioCallSid,
      direction: call.direction,
      from: call.from,
      fromName: call.fromName,
      to: call.to,
      toName: call.toName,
      outcome: "answered",
      handledByUserId: call.assignedUserId,
      startedAt: call.startedAt,
      answeredAt: call.answeredAt,
      endedAt: Date.now(),
      duration: call.answeredAt ? Math.floor((Date.now() - call.answeredAt) / 1000) : 0,
      notes: call.notes,
    });

    // Update user status
    if (call.assignedUserId) {
      await ctx.db.patch(call.assignedUserId, {
        status: "available",
        updatedAt: Date.now(),
      });
    }

    // Delete active call
    await ctx.db.delete(args.callId);

    return { success: true };
  },
});
