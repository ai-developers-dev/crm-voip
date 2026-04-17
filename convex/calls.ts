import { mutation, query, internalMutation, internalQuery, MutationCtx, action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { authorizeOrgMember, authorizeOrgAdmin } from "./lib/auth";

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
    await authorizeOrgMember(ctx, args.organizationId);

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
    await authorizeOrgMember(ctx, args.organizationId);

    // Check if call already exists
    const existing = await ctx.db
      .query("activeCalls")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .first();

    if (existing) {
      return existing._id;
    }

    // Lookup contact by phone number for caller ID (using lookup table for O(1))
    const normalizedFrom = args.from.replace(/\D/g, "").slice(-10);
    const phoneLookup = await ctx.db
      .query("contactPhoneLookup")
      .withIndex("by_org_phone", (q) =>
        q.eq("organizationId", args.organizationId).eq("normalizedPhone", normalizedFrom)
      )
      .first();
    const matchingContact = phoneLookup ? await ctx.db.get(phoneLookup.contactId) : null;

    const fromName = matchingContact
      ? `${matchingContact.firstName}${matchingContact.lastName ? " " + matchingContact.lastName : ""}`
      : undefined;

    // Create new incoming call
    return await ctx.db.insert("activeCalls", {
      organizationId: args.organizationId,
      twilioCallSid: args.twilioCallSid,
      direction: "inbound",
      from: args.from,
      fromName,
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

// Mutation for webhook use (called from Twilio webhook API routes that validate signatures)
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
      return;
    }

    const updates: Record<string, string | number> = {
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

      // Trigger workflow: missed_call (no answer, busy, canceled)
      const callOutcome = (args.outcome as string) || "answered";
      if (callOutcome !== "answered" && call.direction === "inbound") {
        // Find contact by caller phone number (using lookup table for O(1))
        const normalizedFrom = call.from.replace(/\D/g, "").slice(-10);
        const phoneLookup = await ctx.db
          .query("contactPhoneLookup")
          .withIndex("by_org_phone", (q) =>
            q.eq("organizationId", call.organizationId).eq("normalizedPhone", normalizedFrom)
          )
          .first();
        const matchingContact = phoneLookup ? await ctx.db.get(phoneLookup.contactId) : null;
        if (matchingContact) {
          await ctx.scheduler.runAfter(0, internal.workflowEngine.checkTriggers, {
            organizationId: call.organizationId,
            triggerType: "missed_call",
            contactId: matchingContact._id,
          });
        }
      }

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
    await authorizeOrgMember(ctx, call.organizationId);

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
    await authorizeOrgMember(ctx, call.organizationId);

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
    await authorizeOrgMember(ctx, args.organizationId);

    // Find call by twilioCallSid
    const call = await ctx.db
      .query("activeCalls")
      .withIndex("by_twilio_sid", (q) =>
        q.eq("twilioCallSid", args.twilioCallSid)
      )
      .first();

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
      // Update user status back to available
      if (call.assignedUserId) {
        await ctx.db.patch(call.assignedUserId, {
          status: "available",
          updatedAt: Date.now(),
        });
      }
    }

    // Flip the parker's presence status to "available" immediately. Without
    // this, presence stays "on_call" until the next client heartbeat (up to
    // 30s), and the voice webhook's agent-availability filter drops them —
    // the next inbound call plays "all agents are currently busy".
    const parkerUserId = args.parkedByUserId || call?.assignedUserId;
    if (parkerUserId) {
      const parkerPresence = await ctx.db
        .query("presence")
        .withIndex("by_user", (q) => q.eq("userId", parkerUserId))
        .first();
      if (parkerPresence) {
        await ctx.db.patch(parkerPresence._id, {
          status: "available",
          currentCallId: undefined,
          lastHeartbeat: Date.now(),
        });
      }
    }

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
    await authorizeOrgMember(ctx, args.organizationId);

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
    await authorizeOrgMember(ctx, call.organizationId);

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

// Mutation to set a call on hold (for multi-call scenarios)
export const setHold = mutation({
  args: {
    callId: v.id("activeCalls"),
    isHeld: v.boolean(),
    holdConferenceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) {
      return { success: false, reason: "call_not_found" };
    }
    await authorizeOrgMember(ctx, call.organizationId);

    await ctx.db.patch(args.callId, {
      state: args.isHeld ? "on_hold" : "connected",
      holdStartedAt: args.isHeld ? Date.now() : undefined,
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
      const org = await ctx.db
        .query("organizations")
        .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", clerkOrgId))
        .first();
      if (org) {
        const foundOrgId = org._id; // Capture for TypeScript narrowing in callbacks
        orgId = foundOrgId;

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
          call = ringingCall; // Use this call instead
        }
      }
    }

    if (!orgId) {
      return { success: false, reason: "call_not_found_no_org" };
    }

    await authorizeOrgMember(ctx, orgId);

    // Find the user by Clerk ID AND organization
    // Important: Same Clerk user can exist in multiple orgs, so we must match the org
    const usersWithClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.agentClerkId))
      .collect();

    const user = usersWithClerkId.find(u => u.organizationId === orgId);

    if (!user) {
      return { success: false, reason: "agent_not_found" };
    }

    // MULTI-CALL: Check if user has reached max concurrent calls
    const org = await ctx.db.get(orgId);
    const maxConcurrentCalls = org?.settings?.maxConcurrentCalls ?? 3;

    const userActiveCalls = await ctx.db
      .query("activeCalls")
      .withIndex("by_assigned_user", (q) => q.eq("assignedUserId", user._id))
      .filter((q) => q.neq(q.field("state"), "ended"))
      .collect();

    if (userActiveCalls.length >= maxConcurrentCalls) {
      return { success: false, reason: "max_calls_reached" };
    }

    // Handle case where call record doesn't exist yet (race condition)
    // The call record will be created by webhook soon
    if (!call) {
      await ctx.db.patch(user._id, {
        status: "on_call",
        updatedAt: Date.now(),
      });

      return { success: true, reason: "status_updated_call_pending", userId: user._id };
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
      updatedAt: Date.now(),
    });

    return { success: true, callId: call._id, userId: user._id };
  },
});

// Mutation to end a call
export const end = mutation({
  args: { callId: v.id("activeCalls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
    await authorizeOrgMember(ctx, call.organizationId);

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
      outcome: call.answeredAt ? "answered" : "missed",
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
      // Flip presence immediately so the next inbound call sees this agent
      // as available — otherwise presence stays "on_call" until the next
      // 30s heartbeat and the voice webhook plays "all agents busy".
      const presence = await ctx.db
        .query("presence")
        .withIndex("by_user", (q) => q.eq("userId", call.assignedUserId!))
        .first();
      if (presence) {
        await ctx.db.patch(presence._id, {
          status: "available",
          currentCallId: undefined,
          lastHeartbeat: Date.now(),
        });
      }
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
      return { success: true, alreadyCleaned: true };
    }
    await authorizeOrgMember(ctx, call.organizationId);

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
      outcome: call.answeredAt ? "answered" : "missed",
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
      // Same presence flip as calls:end — otherwise the next inbound call
      // sees this agent as "on_call" until the next client heartbeat.
      const presence = await ctx.db
        .query("presence")
        .withIndex("by_user", (q) => q.eq("userId", call.assignedUserId!))
        .first();
      if (presence) {
        await ctx.db.patch(presence._id, {
          status: "available",
          currentCallId: undefined,
          lastHeartbeat: Date.now(),
        });
      }
    }

    // Delete active call
    await ctx.db.delete(call._id);

    return { success: true };
  },
});

// Mutation to clear all active calls (admin cleanup)
export const clearAllActiveCalls = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await authorizeOrgAdmin(ctx, args.organizationId);

    const calls = await ctx.db
      .query("activeCalls")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    for (const call of calls) {
      await ctx.db.delete(call._id);
    }

    return { success: true, clearedCount: calls.length };
  },
});

// OPTIMIZED: Single query that handles phone lookup + available agents in one HTTP round-trip
// This eliminates the sequential HTTP calls that were causing 2-3 ring delays
export const getIncomingCallData = query({
  args: { phoneNumber: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Step 1: Look up phone number config
    const phoneConfig = await ctx.db
      .query("phoneNumbers")
      .withIndex("by_phone_number", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (!phoneConfig) {
      return { found: false as const, phoneNumber: args.phoneNumber };
    }

    const orgId = phoneConfig.organizationId;

    // Step 2: Run organization lookup and presence query in PARALLEL
    const [organization, presenceRecords] = await Promise.all([
      ctx.db.get(orgId),
      ctx.db
        .query("presence")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .collect(),
    ]);

    if (!organization) {
      return { found: false as const, phoneNumber: args.phoneNumber };
    }

    // Step 3: Filter to available agents with recent heartbeats
    const availablePresence = presenceRecords.filter(
      (p) =>
        now - p.lastHeartbeat < 60000 &&
        (p.status === "available" || p.status === "on_break")
    );

    // Step 4: Batch fetch all users in PARALLEL
    let agents: Array<{
      _id: string;
      clerkUserId: string;
      clerkOrgId: string;
      name: string;
      role: string;
      status: string;
      twilioIdentity: string;
    }> = [];

    if (availablePresence.length > 0) {
      const users = await Promise.all(
        availablePresence.map((presence) => ctx.db.get(presence.userId))
      );

      agents = availablePresence
        .map((presence, index) => {
          const user = users[index];
          if (!user) return null;
          return {
            _id: user._id,
            clerkUserId: user.clerkUserId,
            clerkOrgId: organization.clerkOrgId,
            name: user.name,
            role: user.role,
            status: presence.status,
            twilioIdentity: `${organization.clerkOrgId}-${user.clerkUserId}`,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null);
    } else {
      // Fallback: Check users with status "available" directly
      const availableUsers = await ctx.db
        .query("users")
        .withIndex("by_organization_status", (q) =>
          q.eq("organizationId", orgId).eq("status", "available")
        )
        .collect();

      agents = availableUsers.map((user) => ({
        _id: user._id,
        clerkUserId: user.clerkUserId,
        clerkOrgId: organization.clerkOrgId,
        name: user.name,
        role: user.role,
        status: user.status,
        twilioIdentity: `${organization.clerkOrgId}-${user.clerkUserId}`,
      }));
    }

    return {
      found: true as const,
      organizationId: orgId,
      clerkOrgId: organization.clerkOrgId,
      aiAgentId: phoneConfig.aiAgentId,
      phoneConfig: {
        _id: phoneConfig._id,
        friendlyName: phoneConfig.friendlyName,
        type: phoneConfig.type,
        routingType: phoneConfig.routingType,
        assignedUserId: phoneConfig.assignedUserId,
        ringGroupUserIds: phoneConfig.ringGroupUserIds,
        voicemailEnabled: phoneConfig.voicemailEnabled,
        unansweredAction: phoneConfig.unansweredAction,
        unansweredTimeoutSeconds: phoneConfig.unansweredTimeoutSeconds,
        unansweredAiAgentId: phoneConfig.unansweredAiAgentId,
        voicemailGreeting: phoneConfig.voicemailGreeting,
      },
      agents,
    };
  },
});

// Store voicemail transcription from Twilio webhook
// Called from webhook API routes that validate Twilio signatures
export const storeTranscription = mutation({
  args: {
    twilioCallSid: v.string(),
    transcriptionSid: v.string(),
    transcriptionText: v.string(),
  },
  handler: async (ctx, args) => {
    const callHistory = await ctx.db
      .query("callHistory")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .first();

    if (callHistory) {
      await ctx.db.patch(callHistory._id, {
        transcriptionText: args.transcriptionText,
        transcriptionSid: args.transcriptionSid,
      });
      return { updated: true, callHistoryId: callHistory._id };
    }

    return { updated: false };
  },
});

// Store recording URL from Twilio recording status callback.
// If the call was a voicemail, also creates a voicemails record.
// Called from webhook API routes that validate Twilio signatures
export const storeRecording = mutation({
  args: {
    twilioCallSid: v.string(),
    recordingUrl: v.string(),
    recordingDuration: v.number(),
    recordingSid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const callHistory = await ctx.db
      .query("callHistory")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .first();

    if (callHistory) {
      await ctx.db.patch(callHistory._id, {
        recordingUrl: args.recordingUrl,
        recordingDuration: args.recordingDuration,
      });

      // If the call outcome is voicemail, create a voicemails record
      if (callHistory.outcome === "voicemail") {
        await ctx.db.insert("voicemails", {
          organizationId: callHistory.organizationId,
          callHistoryId: callHistory._id,
          twilioCallSid: args.twilioCallSid,
          recordingSid: args.recordingSid || "",
          recordingUrl: args.recordingUrl,
          duration: args.recordingDuration,
          callerNumber: callHistory.from,
          callerName: callHistory.fromName,
          contactId: callHistory.contactId,
          isRead: false,
          createdAt: Date.now(),
        });
      }

      return { updated: true, callHistoryId: callHistory._id };
    }

    return { updated: false };
  },
});
