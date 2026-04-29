import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * One-off inspector for the call-log "wrong number" bug.
 *
 * Run from `/Users/dougallen/Desktop/CRM VOIP`:
 *   npx convex run --prod inspectCallLog:inspect
 *
 * Returns the last 24h of callHistory + every current activeCall row
 * for Kover King so we can see what's actually stored. If `from` is
 * wrong in the data, the bug is upstream of the UI; if `from` is
 * right, the UI / display is the bug.
 *
 * Safe to leave checked in — read-only query, no PII exposed beyond
 * what an admin already sees in the dashboard.
 */
export const inspect = query({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    const kk = orgs.find((o) =>
      (o.name || "").toLowerCase().includes("kover"),
    );
    if (!kk) {
      return {
        error: "Kover King org not found",
        orgsSeen: orgs.map((o) => o.name),
      };
    }

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recent = await ctx.db
      .query("callHistory")
      .withIndex("by_organization_date", (q) =>
        q.eq("organizationId", kk._id).gte("startedAt", oneDayAgo),
      )
      .order("desc")
      .take(20);

    const active = await ctx.db
      .query("activeCalls")
      .withIndex("by_organization", (q) => q.eq("organizationId", kk._id))
      .collect();

    return {
      org: { _id: kk._id, name: kk.name },
      now: Date.now(),
      nowIso: new Date().toISOString(),
      callHistoryRecent: recent.map((c) => ({
        _id: c._id,
        twilioCallSid: c.twilioCallSid,
        direction: c.direction,
        outcome: c.outcome,
        from: c.from,
        fromName: c.fromName,
        to: c.to,
        toName: c.toName,
        startedAtIso: new Date(c.startedAt).toISOString(),
        duration: c.duration,
      })),
      activeCallsNow: active.map((c) => ({
        _id: c._id,
        twilioCallSid: c.twilioCallSid,
        pstnCallSid: c.pstnCallSid,
        childCallSid: c.childCallSid,
        direction: c.direction,
        state: c.state,
        from: c.from,
        fromName: c.fromName,
        to: c.to,
        toName: c.toName,
        startedAtIso: new Date(c.startedAt).toISOString(),
        assignedUserId: c.assignedUserId,
      })),
    };
  },
});

/**
 * Stale-row cleaner. Runs every 30 min via convex/crons.ts AND can be
 * invoked manually:
 *   npx convex run --component-args inspectCallLog:cleanStaleRinging '{"olderThanMinutes": 60}'
 *
 * Deletes activeCalls rows older than `olderThanMinutes` AND stuck in
 * "ringing" or "connecting" — these are the orphaned-call zombies that
 * get left behind when bug paths fail to clean up. Safe to run: no
 * live call sits in "ringing" longer than ~60 seconds (Twilio Dial
 * timeout) and "connecting" outbounds resolve within ~30 seconds.
 *
 * `internalMutation` so it's callable from crons and the CLI but NOT
 * from the public API — keeps it admin-only by transport.
 */
export const cleanStaleRinging = internalMutation({
  args: {
    olderThanMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.olderThanMinutes ?? 60) * 60 * 1000;
    const allActive = await ctx.db.query("activeCalls").collect();
    const stale = allActive.filter(
      (c) =>
        c.startedAt < cutoff &&
        (c.state === "ringing" || c.state === "connecting"),
    );
    const deleted = stale.map((c) => ({
      _id: c._id,
      twilioCallSid: c.twilioCallSid,
      direction: c.direction,
      state: c.state,
      from: c.from,
      to: c.to,
      startedAtIso: new Date(c.startedAt).toISOString(),
    }));
    for (const c of stale) {
      await ctx.db.delete(c._id);
    }
    return { deletedCount: stale.length, deleted };
  },
});
