import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// ── Queries ──────────────────────────────────────────────────────────

/** Get tickets for a tenant organization */
export const getTicketsForTenant = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("supportTickets")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect()
      .then((tickets) => tickets.sort((a, b) => b.lastMessageAt - a.lastMessageAt));
  },
});

/** Get all tickets (admin view) — optionally filter by status */
export const getAllTickets = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let tickets = await ctx.db.query("supportTickets").collect();
    if (args.status && args.status !== "all") {
      tickets = tickets.filter((t) => t.status === args.status);
    }
    return tickets.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  },
});

/** Get total unread count for admin badge */
export const getAdminUnreadCount = query({
  handler: async (ctx) => {
    const tickets = await ctx.db.query("supportTickets").collect();
    return tickets.reduce((sum, t) => sum + t.unreadByAdmin, 0);
  },
});

/** Get unread count for a tenant */
export const getTenantUnreadCount = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const tickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return tickets.reduce((sum, t) => sum + t.unreadByTenant, 0);
  },
});

/** Get messages for a ticket */
export const getMessages = query({
  args: { ticketId: v.id("supportTickets") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("supportMessages")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect()
      .then((msgs) => msgs.sort((a, b) => a.createdAt - b.createdAt));
  },
});

/** Get the most recent open ticket for a tenant (for widget) */
export const getOpenTicketForTenant = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const tickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return tickets
      .filter((t) => t.status === "open" || t.status === "in_progress")
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)[0] || null;
  },
});

// ── Mutations ────────────────────────────────────────────────────────

/** Create a new support ticket with initial message */
export const createTicket = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.optional(v.id("users")),
    userName: v.string(),
    orgName: v.string(),
    message: v.string(),
    subject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ticketId = await ctx.db.insert("supportTickets", {
      organizationId: args.organizationId,
      userId: args.userId,
      userName: args.userName,
      orgName: args.orgName,
      subject: args.subject,
      status: "open",
      priority: "normal",
      lastMessageAt: now,
      lastMessagePreview: args.message.substring(0, 80),
      unreadByTenant: 0,
      unreadByAdmin: 1,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("supportMessages", {
      ticketId,
      senderType: "tenant",
      senderName: args.userName,
      body: args.message,
      createdAt: now,
    });

    // Get platform org for auto-reply settings
    const platformOrg = await ctx.db
      .query("organizations")
      .withIndex("by_is_platform", (q) => q.eq("isPlatformOrg", true))
      .first();

    const settings = platformOrg?.settings as any;
    const autoReply = settings?.supportAutoReply;
    const noAgentMessage = settings?.supportNoAgentMessage;
    const delaySec = settings?.supportAutoReplyDelaySec;

    // Send auto-reply immediately if configured
    if (autoReply) {
      await ctx.db.insert("supportMessages", {
        ticketId,
        senderType: "admin",
        senderName: "Support Bot",
        body: autoReply,
        createdAt: now + 1, // +1ms so it sorts after the user's message
      });
      await ctx.db.patch(ticketId, {
        lastMessagePreview: autoReply.substring(0, 80),
        unreadByTenant: 1,
      });
    }

    // Schedule no-agent follow-up if configured
    if (noAgentMessage && delaySec && delaySec > 0) {
      await ctx.scheduler.runAfter(delaySec * 1000, internal.support.sendNoAgentMessage, {
        ticketId,
        message: noAgentMessage,
      });
    }

    return ticketId;
  },
});

/** Send a message on an existing ticket */
export const sendMessage = mutation({
  args: {
    ticketId: v.id("supportTickets"),
    body: v.string(),
    senderType: v.union(v.literal("tenant"), v.literal("admin")),
    senderName: v.string(),
    senderUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) throw new Error("Ticket not found");

    const now = Date.now();
    await ctx.db.insert("supportMessages", {
      ticketId: args.ticketId,
      senderType: args.senderType,
      senderName: args.senderName,
      senderUserId: args.senderUserId,
      body: args.body,
      createdAt: now,
    });

    // Update ticket
    await ctx.db.patch(args.ticketId, {
      lastMessageAt: now,
      lastMessagePreview: args.body.substring(0, 80),
      updatedAt: now,
      // Increment unread for the OTHER side
      ...(args.senderType === "tenant"
        ? { unreadByAdmin: ticket.unreadByAdmin + 1 }
        : { unreadByTenant: ticket.unreadByTenant + 1 }),
      // Reopen if resolved and tenant replies
      ...(args.senderType === "tenant" && ticket.status === "resolved"
        ? { status: "open" as const }
        : {}),
    });
  },
});

/** Mark messages as read */
export const markAsRead = mutation({
  args: {
    ticketId: v.id("supportTickets"),
    readerType: v.union(v.literal("tenant"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.ticketId, {
      ...(args.readerType === "tenant" ? { unreadByTenant: 0 } : { unreadByAdmin: 0 }),
    });
  },
});

/** Update ticket status */
export const updateStatus = mutation({
  args: {
    ticketId: v.id("supportTickets"),
    status: v.union(v.literal("open"), v.literal("in_progress"), v.literal("resolved"), v.literal("closed")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.ticketId, {
      status: args.status,
      updatedAt: Date.now(),
      ...(args.status === "resolved" ? { resolvedAt: Date.now() } : {}),
    });
  },
});

/** Assign ticket to a platform user */
export const assignTicket = mutation({
  args: {
    ticketId: v.id("supportTickets"),
    assignedToId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.ticketId, {
      assignedToId: args.assignedToId,
      status: "in_progress",
      updatedAt: Date.now(),
    });
  },
});

// ── Auto-Reply / No-Agent ────────────────────────────────────────────

/** Scheduled: send no-agent message if ticket still hasn't been replied to */
export const sendNoAgentMessage = internalMutation({
  args: {
    ticketId: v.id("supportTickets"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) return;

    // Only send if still "open" (no admin has replied / changed status)
    if (ticket.status !== "open") return;

    // Check if any admin has replied
    const messages = await ctx.db
      .query("supportMessages")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();
    const hasAdminReply = messages.some((m) => m.senderType === "admin" && m.senderName !== "Support Bot");
    if (hasAdminReply) return;

    const now = Date.now();
    await ctx.db.insert("supportMessages", {
      ticketId: args.ticketId,
      senderType: "admin",
      senderName: "Support Bot",
      body: args.message,
      createdAt: now,
    });

    await ctx.db.patch(args.ticketId, {
      status: "in_progress",
      lastMessageAt: now,
      lastMessagePreview: args.message.substring(0, 80),
      unreadByTenant: (ticket.unreadByTenant || 0) + 1,
      updatedAt: now,
    });
  },
});

/** Get support auto-reply settings from platform org */
export const getAutoReplySettings = query({
  handler: async (ctx) => {
    const platformOrg = await ctx.db
      .query("organizations")
      .withIndex("by_is_platform", (q) => q.eq("isPlatformOrg", true))
      .first();
    if (!platformOrg) return null;
    const s = platformOrg.settings as any;
    return {
      autoReply: s?.supportAutoReply || "",
      noAgentMessage: s?.supportNoAgentMessage || "",
      delaySec: s?.supportAutoReplyDelaySec || 300,
    };
  },
});

/** Save support auto-reply settings to platform org */
export const saveAutoReplySettings = mutation({
  args: {
    autoReply: v.string(),
    noAgentMessage: v.string(),
    delaySec: v.number(),
  },
  handler: async (ctx, args) => {
    const platformOrg = await ctx.db
      .query("organizations")
      .withIndex("by_is_platform", (q) => q.eq("isPlatformOrg", true))
      .first();
    if (!platformOrg) throw new Error("Platform org not found");

    await ctx.db.patch(platformOrg._id, {
      settings: {
        ...platformOrg.settings,
        supportAutoReply: args.autoReply,
        supportNoAgentMessage: args.noAgentMessage,
        supportAutoReplyDelaySec: args.delaySec,
      },
      updatedAt: Date.now(),
    });
  },
});
