import { mutation, query, internalMutation, internalQuery, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

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

// Public mutation to create outgoing call
export const createOutgoing = mutation({
  args: {
    organizationId: v.id("organizations"),
    twilioCallSid: v.string(),
    from: v.string(),
    to: v.string(),
    toName: v.optional(v.string()),
    userId: v.optional(v.id("users")), // User who made the outbound call
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

    // Increment daily outbound call counter for this agent
    if (args.userId) {
      await ctx.runMutation(internal.userMetrics.incrementCallsAccepted, {
        userId: args.userId,
        organizationId: args.organizationId,
        direction: "outbound",
      });
    }

    // Create new outgoing call
    return await ctx.db.insert("activeCalls", {
      organizationId: args.organizationId,
      twilioCallSid: args.twilioCallSid,
      direction: "outbound",
      from: args.from,
      to: args.to,
      toName: args.toName,
      state: "connecting",
      startedAt: Date.now(),
      isRecording: false,
      assignedUserId: args.userId,
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

    // IMPORTANT: Don't process "ended" for parked calls
    // When we park a call, the browser SDK disconnects which triggers a "completed" status
    // But the call is still active in the conference - don't delete it!
    if (args.state === "ended" && call.state === "parked") {
      console.log(`Ignoring 'ended' status for parked call ${args.twilioCallSid} - call is in parking lot`);
      return;
    }

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

// Mutation to park a call using twilioCallSid (avoids race condition with _id)
export const parkByCallSid = mutation({
  args: {
    twilioCallSid: v.string(),
    pstnCallSid: v.optional(v.string()), // The PSTN caller's call SID (for unparking)
    conferenceName: v.string(),
    callerNumber: v.string(),
    callerName: v.optional(v.string()),
    organizationId: v.id("organizations"),
    parkedByUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    console.log("🅿️ parkByCallSid called with:", {
      twilioCallSid: args.twilioCallSid,
      pstnCallSid: args.pstnCallSid,
      conferenceName: args.conferenceName,
      callerNumber: args.callerNumber,
      organizationId: args.organizationId,
    });

    // Find call by twilioCallSid
    const call = await ctx.db
      .query("activeCalls")
      .withIndex("by_twilio_sid", (q) =>
        q.eq("twilioCallSid", args.twilioCallSid)
      )
      .first();

    console.log("🅿️ Found activeCall:", call ? { id: call._id, state: call.state, from: call.from } : "NOT FOUND");

    // Find first available slot
    const slots = await ctx.db
      .query("parkingLots")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    // Find first empty slot or create new one
    let slotNumber = 1;
    const occupiedSlots = new Set(slots.filter(s => s.isOccupied).map(s => s.slotNumber));
    while (occupiedSlots.has(slotNumber) && slotNumber <= 10) {
      slotNumber++;
    }

    if (slotNumber > 10) {
      throw new Error("All parking slots are occupied");
    }

    const existingSlot = slots.find(s => s.slotNumber === slotNumber);

    // Update or create parking slot
    if (existingSlot) {
      await ctx.db.patch(existingSlot._id, {
        isOccupied: true,
        activeCallId: call?._id,
        parkedByUserId: args.parkedByUserId,
        parkedAt: Date.now(),
        conferenceName: args.conferenceName,
        pstnCallSid: args.pstnCallSid,
        callerNumber: args.callerNumber,
        callerName: args.callerName,
      });
    } else {
      await ctx.db.insert("parkingLots", {
        organizationId: args.organizationId,
        slotNumber,
        isOccupied: true,
        activeCallId: call?._id,
        parkedByUserId: args.parkedByUserId,
        parkedAt: Date.now(),
        conferenceName: args.conferenceName,
        pstnCallSid: args.pstnCallSid,
        callerNumber: args.callerNumber,
        callerName: args.callerName,
      });
    }

    // Update call state if it exists
    if (call) {
      await ctx.db.patch(call._id, {
        state: "parked",
        parkingSlot: slotNumber,
        holdStartedAt: Date.now(),
      });
      console.log(`🅿️ Updated activeCall ${call._id} to state=parked, slot=${slotNumber}`);

      // Update user status back to available
      if (call.assignedUserId) {
        await ctx.db.patch(call.assignedUserId, {
          status: "available",
          updatedAt: Date.now(),
        });
      }
    } else {
      console.log("🅿️ WARNING: No activeCall found - parking lot entry created but call state not updated");
    }

    console.log(`🅿️ parkByCallSid SUCCESS - slot ${slotNumber}, conference: ${args.conferenceName}`);

    return {
      success: true,
      slotNumber,
      conferenceName: args.conferenceName,
      callId: call?._id,
    };
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

// Mutation to claim a call (prevents race condition when multiple agents answer)
export const claimCall = mutation({
  args: {
    twilioCallSid: v.string(),
    agentClerkId: v.string(),
    clerkOrgId: v.optional(v.string()), // Fallback org lookup for race condition handling
  },
  handler: async (ctx, args) => {
    console.log(`\n=== CLAIM CALL MUTATION DEBUG ===`);
    console.log(`Input: twilioCallSid=${args.twilioCallSid}, agentClerkId=${args.agentClerkId}, clerkOrgId=${args.clerkOrgId}`);

    // Find the call by Twilio SID
    // NOTE: This might be the AGENT leg's SID, not the PSTN caller's SID
    // Twilio creates two calls: PSTN→Twilio (original) and Twilio→Agent (browser)
    let call = await ctx.db
      .query("activeCalls")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .first();

    // Determine organization ID from call record or fallback to clerkOrgId lookup
    let orgId = call?.organizationId;

    if (!call && args.clerkOrgId) {
      const clerkOrgId = args.clerkOrgId; // Assign to const for TypeScript
      console.log(`⚠️ Call NOT FOUND by exact SID - using clerkOrgId fallback: ${clerkOrgId}`);
      const org = await ctx.db
        .query("organizations")
        .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", clerkOrgId))
        .first();
      if (org) {
        const foundOrgId = org._id; // Capture for TypeScript narrowing in callbacks
        orgId = foundOrgId;
        console.log(`✓ Found org by clerkOrgId: ${orgId}`);

        // CRITICAL FIX: The twilioCallSid from the browser is the AGENT leg's SID,
        // but the activeCall was created with the PSTN leg's SID.
        // Look for any ringing inbound call in this org instead.
        const ringingCall = await ctx.db
          .query("activeCalls")
          .withIndex("by_organization_state", (q) =>
            q.eq("organizationId", foundOrgId).eq("state", "ringing")
          )
          .first();

        if (ringingCall) {
          console.log(`✓ Found ringing call in org: id=${ringingCall._id}, from=${ringingCall.from}, twilioSid=${ringingCall.twilioCallSid}`);
          call = ringingCall; // Use this call instead
        } else {
          console.log(`⚠️ No ringing calls found in org ${org._id}`);
        }
      }
    } else if (call) {
      console.log(`✓ Found call by exact SID: id=${call._id}, org=${call.organizationId}, state=${call.state}`);
    }

    if (!orgId) {
      console.log(`❌ Could not determine organization (call not found, no clerkOrgId fallback)`);
      return { success: false, reason: "call_not_found_no_org" };
    }

    // Find the user by Clerk ID AND organization
    // Important: Same Clerk user can exist in multiple orgs, so we must match the org
    const usersWithClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.agentClerkId))
      .collect();

    console.log(`✓ Found ${usersWithClerkId.length} users with clerkId ${args.agentClerkId}:`);
    usersWithClerkId.forEach(u => console.log(`  - ${u.name} (${u._id}) in org ${u.organizationId}`));

    const user = usersWithClerkId.find(u => u.organizationId === orgId);

    if (!user) {
      console.log(`❌ No user found in org ${orgId}`);
      return { success: false, reason: "agent_not_found" };
    }
    console.log(`✓ Matched user: ${user.name} (${user._id})`)

    // Calculate today's date and user metrics (used in both paths)
    const today = new Date().toISOString().split("T")[0];
    const isNewDay = user.lastCallCountReset !== today;
    const currentInbound = isNewDay ? 0 : (user.todayInboundCalls || 0);
    const currentOutbound = isNewDay ? 0 : (user.todayOutboundCalls || 0);
    const newInbound = currentInbound + 1;

    // Handle case where call record doesn't exist yet (race condition)
    // Still increment stats - the call record will be created by webhook soon
    if (!call) {
      console.log(`⚠️ No call record found - updating user status (call record pending)`);

      await ctx.db.patch(user._id, {
        status: "on_call",
        todayInboundCalls: newInbound,
        todayOutboundCalls: currentOutbound,
        lastCallCountReset: today,
        updatedAt: Date.now(),
      });

      return { success: true, reason: "stats_incremented_call_pending", userId: user._id };
    }

    // Check if already claimed by another agent
    if (call.assignedUserId && call.assignedUserId !== user._id) {
      return { success: false, reason: "already_claimed" };
    }

    // Check if call is still in a claimable state
    if (call.state !== "ringing" && call.state !== "connecting") {
      // If already claimed by this agent, return success
      if (call.assignedUserId === user._id) {
        return { success: true, callId: call._id };
      }
      return { success: false, reason: "call_not_claimable" };
    }

    // Claim the call atomically
    await ctx.db.patch(call._id, {
      assignedUserId: user._id,
      state: "connected",
      answeredAt: Date.now(),
    });

    // Update user status to on_call
    await ctx.db.patch(user._id, {
      status: "on_call",
      todayInboundCalls: newInbound,
      todayOutboundCalls: currentOutbound,
      lastCallCountReset: today,
      updatedAt: Date.now(),
    });

    console.log(`✅ Call claimed by ${user.name}`);

    return { success: true, callId: call._id, userId: user._id };
  },
});

// Mutation to end a call
export const end = mutation({
  args: { callId: v.id("activeCalls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");

    const talkTimeSeconds = call.answeredAt ? Math.floor((Date.now() - call.answeredAt) / 1000) : 0;

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
      duration: talkTimeSeconds,
      notes: call.notes,
    });

    // Add talk time to agent's daily metrics
    if (call.assignedUserId && talkTimeSeconds > 0) {
      await ctx.runMutation(internal.userMetrics.addTalkTime, {
        userId: call.assignedUserId,
        organizationId: call.organizationId,
        talkTimeSeconds,
      });
    }

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

// Mutation to end a call by Twilio CallSid (for cleanup from frontend)
export const endByCallSid = mutation({
  args: { twilioCallSid: v.string() },
  handler: async (ctx, args) => {
    const call = await ctx.db
      .query("activeCalls")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .first();

    if (!call) {
      console.log(`Call ${args.twilioCallSid} not found - may already be cleaned up`);
      return { success: true, alreadyCleaned: true };
    }

    const talkTimeSeconds = call.answeredAt ? Math.floor((Date.now() - call.answeredAt) / 1000) : 0;

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
      duration: talkTimeSeconds,
      notes: call.notes,
    });

    // Add talk time to agent's daily metrics
    if (call.assignedUserId && talkTimeSeconds > 0) {
      await ctx.runMutation(internal.userMetrics.addTalkTime, {
        userId: call.assignedUserId,
        organizationId: call.organizationId,
        talkTimeSeconds,
      });
    }

    // Update user status
    if (call.assignedUserId) {
      await ctx.db.patch(call.assignedUserId, {
        status: "available",
        updatedAt: Date.now(),
      });
    }

    // Delete active call
    await ctx.db.delete(call._id);

    console.log(`Call ${args.twilioCallSid} ended and moved to history`);
    return { success: true };
  },
});

// Mutation to clear all active calls (admin cleanup)
export const clearAllActiveCalls = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("activeCalls")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    for (const call of calls) {
      await ctx.db.delete(call._id);
    }

    console.log(`Cleared ${calls.length} active calls`);
    return { success: true, clearedCount: calls.length };
  },
});
