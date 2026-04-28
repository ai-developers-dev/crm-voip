import { mutation, query, MutationCtx } from "./_generated/server";
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

// Query to get call by Twilio SID — looks up by EITHER the PSTN-leg
// SID (twilioCallSid) or the agent-leg SID (childCallSid). For inbound
// calls the row is keyed by PSTN SID but the browser only knows the
// agent SID, so any caller checking "is this call parked / transferring"
// based on a SID from the browser SDK must use this dual-index query —
// otherwise the state guards in /api/twilio/end-call silently fail and
// a parked caller gets hung up the moment the source agent's <Dial>
// bridge breaks. Same dual-lookup pattern as `endByCallSid`.
export const getByTwilioSid = query({
  args: { twilioCallSid: v.string() },
  handler: async (ctx, args) => {
    const byParent = await ctx.db
      .query("activeCalls")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .first();
    if (byParent) return byParent;

    const byChild = await ctx.db
      .query("activeCalls")
      .withIndex("by_child_call_sid", (q) =>
        q.eq("childCallSid", args.twilioCallSid),
      )
      .first();
    return byChild;
  },
});

// Resolve the owning org for a CallSid by walking both the PSTN leg
// (`twilioCallSid`) and the agent leg (`childCallSid`), then falling
// back to the callHistory row if the call already wrapped up. Returns
// `null` if nothing matches. Used by `/api/twilio/end-call` so that
// super admins on `/admin/tenants/[id]` resolve the TENANT's Twilio
// credentials instead of their own active Clerk org — which would
// otherwise have no Twilio config and blow up `getOrgTwilioClient`.
export const getOrgByCallSid = query({
  args: { twilioCallSid: v.string() },
  handler: async (ctx, args) => {
    let orgId: import("./_generated/dataModel").Id<"organizations"> | null = null;

    const activeByParent = await ctx.db
      .query("activeCalls")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .first();
    if (activeByParent) orgId = activeByParent.organizationId;

    if (!orgId) {
      const activeByChild = await ctx.db
        .query("activeCalls")
        .withIndex("by_child_call_sid", (q) =>
          q.eq("childCallSid", args.twilioCallSid),
        )
        .first();
      if (activeByChild) orgId = activeByChild.organizationId;
    }

    if (!orgId) {
      const history = await ctx.db
        .query("callHistory")
        .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
        .first();
      if (history) orgId = history.organizationId;
    }

    if (!orgId) return null;

    const org = await ctx.db.get(orgId);
    if (!org) return null;

    return {
      organizationId: orgId,
      clerkOrgId: org.clerkOrgId,
    };
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


// Webhook-safe variant: called from the Twilio voice webhook, which runs
// server-side with no Clerk session. Gated by phone-number ownership —
// args.to must be a phone number registered to the returned org. Prevents
// random callers from creating activeCalls rows in other orgs.
export const createOrGetIncomingFromWebhook = mutation({
  args: {
    twilioCallSid: v.string(),
    from: v.string(),
    to: v.string(), // the dialed Twilio number we own
  },
  handler: async (ctx, args) => {
    // Lookup the phone number → derive org
    const phoneConfig = await ctx.db
      .query("phoneNumbers")
      .withIndex("by_phone_number", (q) => q.eq("phoneNumber", args.to))
      .first();
    if (!phoneConfig) {
      // Unknown number — do not create a record. Voice webhook already hangs
      // up on unknown numbers, but we double-check here so this mutation is
      // safe to expose unauthenticated.
      return null;
    }
    const organizationId = phoneConfig.organizationId;

    // Dedup by Twilio CallSid
    const existing = await ctx.db
      .query("activeCalls")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .first();
    if (existing) return existing._id;

    // Caller-ID lookup (same O(1) path as the authed variant)
    const normalizedFrom = args.from.replace(/\D/g, "").slice(-10);
    const phoneLookup = await ctx.db
      .query("contactPhoneLookup")
      .withIndex("by_org_phone", (q) =>
        q.eq("organizationId", organizationId).eq("normalizedPhone", normalizedFrom)
      )
      .first();
    const matchingContact = phoneLookup ? await ctx.db.get(phoneLookup.contactId) : null;
    const fromName = matchingContact
      ? `${matchingContact.firstName}${matchingContact.lastName ? " " + matchingContact.lastName : ""}`
      : undefined;

    return await ctx.db.insert("activeCalls", {
      organizationId,
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

// Webhook-safe outbound variant. Gated by `from` (the org's own phone number
// the call is dialed from) existing in phoneNumbers — same trust boundary as
// the inbound version. userClerkId is optional; when present we attribute
// the call to that user for metrics.
export const createOrGetOutgoingFromWebhook = mutation({
  args: {
    twilioCallSid: v.string(),
    from: v.string(), // the org's Twilio number we dialed out of
    to: v.string(),   // the PSTN destination
    toName: v.optional(v.string()),
    userClerkId: v.optional(v.string()),
    userClerkOrgId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const phoneConfig = await ctx.db
      .query("phoneNumbers")
      .withIndex("by_phone_number", (q) => q.eq("phoneNumber", args.from))
      .first();
    if (!phoneConfig) return null;
    const organizationId = phoneConfig.organizationId;

    const existing = await ctx.db
      .query("activeCalls")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .first();
    if (existing) return existing._id;

    // Resolve the originating user by matching clerkUserId + org.
    let userId: import("./_generated/dataModel").Id<"users"> | undefined;
    if (args.userClerkId) {
      const userRow = await ctx.db
        .query("users")
        .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.userClerkId!))
        .collect()
        .then((rows) => rows.find((u) => u.organizationId === organizationId));
      if (userRow) userId = userRow._id;
    }

    // Try to resolve the destination number to a known contact.
    const normalizedTo = args.to.replace(/\D/g, "").slice(-10);
    const phoneLookup = await ctx.db
      .query("contactPhoneLookup")
      .withIndex("by_org_phone", (q) =>
        q.eq("organizationId", organizationId).eq("normalizedPhone", normalizedTo),
      )
      .first();
    const matchingContact = phoneLookup ? await ctx.db.get(phoneLookup.contactId) : null;
    const toName = args.toName
      ?? (matchingContact
        ? `${matchingContact.firstName}${matchingContact.lastName ? " " + matchingContact.lastName : ""}`
        : undefined);

    return await ctx.db.insert("activeCalls", {
      organizationId,
      twilioCallSid: args.twilioCallSid,
      direction: "outbound",
      from: args.from,
      to: args.to,
      toName,
      state: "connecting",
      startedAt: Date.now(),
      isRecording: false,
      assignedUserId: userId,
    });
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

    // IMPORTANT: Don't process "ended" for parked or transferring calls.
    // When we park a call, the browser SDK disconnects which triggers
    // a "completed" status — but the call is still active in the
    // conference, don't delete it. Same for transferring: the source
    // agent's leg ends the moment we move the caller into the
    // transfer conference, but the caller is still active and the
    // target is about to join.
    if (
      args.state === "ended" &&
      (call.state === "parked" || call.state === "transferring")
    ) {
      return;
    }

    // Belt-and-suspenders: even if state isn't "parked", consult the
    // parkingLots table. If a slot still exists for this PSTN SID
    // (or for any SID we know maps to this call), don't delete —
    // the caller is alive and waiting for an unpark.
    if (args.state === "ended") {
      const parkedSlot = await ctx.db
        .query("parkingLots")
        .withIndex("by_pstn_call_sid", (q) =>
          q.eq("pstnCallSid", call.twilioCallSid),
        )
        .first();
      if (parkedSlot && parkedSlot.isOccupied) {
        return;
      }
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

      // Flip presence + user status back to "available" for whichever
      // agent was on the call. Without this, presence stays
      // "on_call" until the agent's next 30-second heartbeat, and
      // the voice webhook's availability filter rejects new
      // inbound calls with "all agents busy" in the meantime. Same
      // logic as `endByCallSid`; centralised here so Twilio-driven
      // hangups (dial-status, outbound-status) get the flip too.
      if (call.assignedUserId) {
        await ctx.db.patch(call.assignedUserId, {
          status: "available",
          updatedAt: Date.now(),
        });
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

    // Find the activeCall row using BOTH SID indexes. For inbound calls
    // the row is keyed by the PSTN-leg SID, but the browser's drag-to-
    // park sends its agent-leg SID — single-index lookup misses, the
    // `state: "parked"` patch below silently skips, and downstream
    // guards (end-call route's parked check) never trip because the
    // row's state is still "connected". Net result before this fix:
    // every parked call dropped within ~200ms because end-call
    // terminated the parent leg believing the call wasn't parked.
    let call = await ctx.db
      .query("activeCalls")
      .withIndex("by_twilio_sid", (q) =>
        q.eq("twilioCallSid", args.twilioCallSid),
      )
      .first();
    if (!call) {
      call = await ctx.db
        .query("activeCalls")
        .withIndex("by_child_call_sid", (q) =>
          q.eq("childCallSid", args.twilioCallSid),
        )
        .first();
    }
    // For inbound calls the route also passes pstnCallSid explicitly
    // (it resolved it via the Twilio API) — use it as a third lookup
    // option in case neither index hit.
    if (!call && args.pstnCallSid) {
      call = await ctx.db
        .query("activeCalls")
        .withIndex("by_twilio_sid", (q) =>
          q.eq("twilioCallSid", args.pstnCallSid!),
        )
        .first();
    }

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

    // Claim the call atomically.
    //
    // Capture the agent-leg CallSid on the row. For inbound calls the row
    // was created by the voice webhook with the PSTN leg's CallSid (the
    // parent), but the browser SDK only knows the agent leg (the child).
    // Without this mapping, any hangup cleanup that uses the browser's
    // SID — e.g. ActiveCallCard.handleEndCall — can't find the row and
    // silently no-ops, leaving the call card stuck on screen.
    //
    // `args.twilioCallSid` here is exactly the agent-leg SID: it comes
    // from `/api/twilio/claim-call` which forwards the browser SDK's
    // `call.parameters.CallSid`. For outbound calls there's no parent/
    // child split, so this is redundant but harmless (same as
    // `call.twilioCallSid`).
    await ctx.db.patch(call._id, {
      assignedUserId: user._id,
      state: "connected",
      answeredAt: Date.now(),
      childCallSid: args.twilioCallSid,
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
    const callHistoryId = await ctx.db.insert("callHistory", {
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

    return { success: true, callHistoryId };
  },
});

// Mutation to end a call by Twilio CallSid (for cleanup from frontend)
export const endByCallSid = mutation({
  args: { twilioCallSid: v.string() },
  handler: async (ctx, args) => {
    // Inbound calls have TWO Twilio legs with different CallSids:
    //   - PSTN leg (parent): stored in `activeCalls.twilioCallSid` by the
    //     voice webhook.
    //   - Agent leg (child): what the browser SDK sees and passes in.
    //     Stored on the same row as `childCallSid` by `claimCall`.
    // Look up by BOTH so this mutation is idempotent regardless of which
    // SID the caller happens to hold. Without this fallback, every
    // in-UI End-button click on an inbound call silently returned
    // `alreadyCleaned` and left the row stuck, which is what made the
    // call card persist on the tenant dashboard.
    let call = await ctx.db
      .query("activeCalls")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .first();

    if (!call) {
      call = await ctx.db
        .query("activeCalls")
        .withIndex("by_child_call_sid", (q) =>
          q.eq("childCallSid", args.twilioCallSid),
        )
        .first();
    }

    if (!call) {
      // Cleanup might be called after the call already moved to history.
      // Try to locate the existing callHistory row so the caller can still
      // open the disposition dialog against it.
      const existingHistory = await ctx.db
        .query("callHistory")
        .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
        .first();
      return {
        success: true,
        alreadyCleaned: true,
        callHistoryId: existingHistory?._id,
      };
    }
    await authorizeOrgMember(ctx, call.organizationId);

    // Don't tear down rows that are mid-flight in another flow:
    //   - "parked": caller is in a hold conference waiting for an unpark.
    //     The same skip exists for parked at the route level too — this
    //     is the defense-in-depth Convex-side guard.
    //   - "transferring": caller has just been moved into a transfer
    //     conference. The source agent's <Dial> bridge breaks the moment
    //     we move the caller, which makes their browser SDK fire
    //     `disconnect`, which calls this mutation. If we proceeded we'd
    //     delete the row mid-transfer and the target agent would join a
    //     conference whose Convex bookkeeping is gone — assignedUserId
    //     swap, presence flip, callHistory insert all come out wrong.
    if (call.state === "parked" || call.state === "transferring") {
      return {
        success: true,
        skipped: true,
        reason: call.state,
      };
    }

    const talkTimeSeconds = call.answeredAt ? Math.floor((Date.now() - call.answeredAt) / 1000) : 0;

    // Move to history
    const callHistoryId = await ctx.db.insert("callHistory", {
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

    return { success: true, callHistoryId };
  },
});

// Clear activeCalls that have been hanging around longer than the
// caller expects — used by the Settings → Diagnostics button so admins
// can flush rows left over from Twilio legs that failed to clean up
// (historic dual-leg SID-mismatch bug, or Twilio webhook drops).
//
// Moves the rows to callHistory with outcome "failed" so there's an
// audit trail, then flips the assigned user's presence back to
// "available" — otherwise the next inbound call could be rejected with
// "all agents busy".
export const clearStuckActiveCalls = mutation({
  args: {
    organizationId: v.id("organizations"),
    olderThanMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await authorizeOrgAdmin(ctx, args.organizationId);

    const thresholdMs = (args.olderThanMinutes ?? 10) * 60 * 1000;
    const cutoff = Date.now() - thresholdMs;

    const calls = await ctx.db
      .query("activeCalls")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();

    const stuck = calls.filter((c) => c.startedAt < cutoff);

    for (const call of stuck) {
      // Move to history so dispositions / reports still see it.
      await ctx.db.insert("callHistory", {
        organizationId: call.organizationId,
        twilioCallSid: call.twilioCallSid,
        direction: call.direction,
        from: call.from,
        fromName: call.fromName,
        to: call.to,
        toName: call.toName,
        outcome: "failed",
        handledByUserId: call.assignedUserId,
        startedAt: call.startedAt,
        answeredAt: call.answeredAt,
        endedAt: Date.now(),
        duration: call.answeredAt
          ? Math.floor((Date.now() - call.answeredAt) / 1000)
          : 0,
        notes: call.notes
          ? `${call.notes}\n[cleared as stuck]`
          : "[cleared as stuck]",
      });

      // Flip presence back to available if someone was on this call.
      if (call.assignedUserId) {
        await ctx.db.patch(call.assignedUserId, {
          status: "available",
          updatedAt: Date.now(),
        });
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

      await ctx.db.delete(call._id);
    }

    return { success: true, clearedCount: stuck.length };
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

// Look up a callHistory row's recording URL, verifying the caller is an
// org member. Used by the server-side proxy that streams Twilio recordings
// (browser <audio> can't send Basic auth, so we fetch with creds server-side).
export const getRecording = query({
  args: { callHistoryId: v.id("callHistory") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.callHistoryId);
    if (!row) return null;
    await authorizeOrgMember(ctx, row.organizationId);
    return row.recordingUrl
      ? {
          recordingUrl: row.recordingUrl,
          organizationId: row.organizationId,
        }
      : null;
  },
});
