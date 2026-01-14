import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

const TRANSFER_TIMEOUT_MS = 30000; // 30 seconds for ringing

// Query to get pending transfers for a target user (for showing incoming transfer UI)
export const getForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const transfers = await ctx.db
      .query("pendingTransfers")
      .withIndex("by_target_user_status", (q) =>
        q.eq("targetUserId", args.userId).eq("status", "ringing")
      )
      .collect();

    // Filter out expired transfers and enrich with call data
    const validTransfers = [];
    for (const transfer of transfers) {
      if (transfer.expiresAt > now) {
        // Get call information
        const call = await ctx.db.get(transfer.activeCallId);
        // Get source user info if available
        let sourceUser = null;
        if (transfer.sourceUserId) {
          sourceUser = await ctx.db.get(transfer.sourceUserId);
        }

        validTransfers.push({
          ...transfer,
          call: call
            ? {
                from: call.from,
                fromName: call.fromName,
              }
            : null,
          sourceUser: sourceUser
            ? {
                name: sourceUser.name,
              }
            : null,
        });
      }
    }

    return validTransfers;
  },
});

// Mutation to initiate a transfer (creates pending transfer record)
export const initiate = mutation({
  args: {
    activeCallId: v.id("activeCalls"),
    twilioCallSid: v.string(),
    sourceUserId: v.optional(v.id("users")),
    targetUserId: v.id("users"),
    type: v.union(v.literal("direct"), v.literal("from_park")),
    returnToParkSlot: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.activeCallId);
    if (!call) throw new Error("Call not found");

    const now = Date.now();

    // Create pending transfer record
    const transferId = await ctx.db.insert("pendingTransfers", {
      organizationId: call.organizationId,
      activeCallId: args.activeCallId,
      twilioCallSid: args.twilioCallSid,
      sourceUserId: args.sourceUserId,
      targetUserId: args.targetUserId,
      status: "ringing",
      type: args.type,
      returnToParkSlot: args.returnToParkSlot,
      createdAt: now,
      expiresAt: now + TRANSFER_TIMEOUT_MS,
    });

    // Update call state to transferring
    await ctx.db.patch(args.activeCallId, {
      state: "transferring",
    });

    return { transferId, expiresAt: now + TRANSFER_TIMEOUT_MS };
  },
});

// Mutation to accept a transfer
export const accept = mutation({
  args: {
    transferId: v.id("pendingTransfers"),
  },
  handler: async (ctx, args) => {
    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status !== "ringing") {
      throw new Error("Transfer is no longer pending");
    }

    const call = await ctx.db.get(transfer.activeCallId);
    if (!call) throw new Error("Call not found");

    // Update transfer status
    await ctx.db.patch(args.transferId, {
      status: "accepted",
    });

    // If this was from parking, clear the parking slot
    if (transfer.type === "from_park" && transfer.returnToParkSlot !== undefined) {
      const slot = await ctx.db
        .query("parkingLots")
        .withIndex("by_organization_slot", (q) =>
          q
            .eq("organizationId", transfer.organizationId)
            .eq("slotNumber", transfer.returnToParkSlot!)
        )
        .first();

      if (slot) {
        await ctx.db.patch(slot._id, {
          isOccupied: false,
          activeCallId: undefined,
          parkedByUserId: undefined,
          parkedAt: undefined,
        });
      }
    }

    // Update the call assignment
    await ctx.db.patch(transfer.activeCallId, {
      state: "connected",
      assignedUserId: transfer.targetUserId,
      previousUserId: transfer.sourceUserId || call.assignedUserId,
      parkingSlot: undefined,
      holdStartedAt: undefined,
    });

    // Update source user status back to available (if any)
    if (transfer.sourceUserId) {
      await ctx.db.patch(transfer.sourceUserId, {
        status: "available",
        updatedAt: Date.now(),
      });
    }

    // Update target user status to on_call
    await ctx.db.patch(transfer.targetUserId, {
      status: "on_call",
      updatedAt: Date.now(),
    });

    return { success: true, callId: transfer.activeCallId };
  },
});

// Mutation to decline a transfer
export const decline = mutation({
  args: {
    transferId: v.id("pendingTransfers"),
  },
  handler: async (ctx, args) => {
    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status !== "ringing") {
      throw new Error("Transfer is no longer pending");
    }

    // Update transfer status
    await ctx.db.patch(args.transferId, {
      status: "declined",
    });

    // Handle based on transfer type
    if (transfer.type === "from_park" && transfer.returnToParkSlot !== undefined) {
      // Return call to parking slot
      await ctx.db.patch(transfer.activeCallId, {
        state: "parked",
        parkingSlot: transfer.returnToParkSlot,
        holdStartedAt: Date.now(),
      });

      // Ensure parking slot is marked as occupied
      const slot = await ctx.db
        .query("parkingLots")
        .withIndex("by_organization_slot", (q) =>
          q
            .eq("organizationId", transfer.organizationId)
            .eq("slotNumber", transfer.returnToParkSlot!)
        )
        .first();

      if (slot) {
        await ctx.db.patch(slot._id, {
          isOccupied: true,
          activeCallId: transfer.activeCallId,
          parkedAt: Date.now(),
        });
      }
    } else if (transfer.sourceUserId) {
      // Return call to source user
      await ctx.db.patch(transfer.activeCallId, {
        state: "connected",
        assignedUserId: transfer.sourceUserId,
      });

      // Update source user status back to on_call
      await ctx.db.patch(transfer.sourceUserId, {
        status: "on_call",
        updatedAt: Date.now(),
      });
    } else {
      // No source and no parking - put on hold with no assignment
      await ctx.db.patch(transfer.activeCallId, {
        state: "on_hold",
        holdStartedAt: Date.now(),
      });
    }

    return {
      success: true,
      returnedTo: transfer.type === "from_park" ? "parking" : "source",
    };
  },
});

// Internal mutation to handle transfer timeout (called by scheduled function)
export const handleTimeout = internalMutation({
  args: {
    transferId: v.id("pendingTransfers"),
  },
  handler: async (ctx, args) => {
    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) return;
    if (transfer.status !== "ringing") return; // Already handled

    // Update transfer status to timeout
    await ctx.db.patch(args.transferId, {
      status: "timeout",
    });

    // Same logic as decline - return to source or parking
    if (transfer.type === "from_park" && transfer.returnToParkSlot !== undefined) {
      await ctx.db.patch(transfer.activeCallId, {
        state: "parked",
        parkingSlot: transfer.returnToParkSlot,
        holdStartedAt: Date.now(),
      });

      const slot = await ctx.db
        .query("parkingLots")
        .withIndex("by_organization_slot", (q) =>
          q
            .eq("organizationId", transfer.organizationId)
            .eq("slotNumber", transfer.returnToParkSlot!)
        )
        .first();

      if (slot) {
        await ctx.db.patch(slot._id, {
          isOccupied: true,
          activeCallId: transfer.activeCallId,
          parkedAt: Date.now(),
        });
      }
    } else if (transfer.sourceUserId) {
      await ctx.db.patch(transfer.activeCallId, {
        state: "connected",
        assignedUserId: transfer.sourceUserId,
      });

      await ctx.db.patch(transfer.sourceUserId, {
        status: "on_call",
        updatedAt: Date.now(),
      });
    }
  },
});

// Query to get transfer by Twilio call SID
export const getByTwilioSid = query({
  args: { twilioCallSid: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pendingTransfers")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .first();
  },
});
