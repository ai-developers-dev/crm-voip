import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ============================================
// QUERIES
// ============================================

// Get all conversations for an organization (sorted by most recent)
export const getConversations = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Sort by lastMessageAt descending (most recent first)
    return conversations.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  },
});

// Get messages for a specific conversation (oldest first - chat order)
export const getMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();
  },
});

// Get a single conversation by ID
export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.conversationId);
  },
});

// Get conversation by phone numbers (for finding existing conversation)
export const getConversationByPhones = query({
  args: {
    organizationId: v.id("organizations"),
    customerPhoneNumber: v.string(),
    businessPhoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_phone_numbers", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("customerPhoneNumber", args.customerPhoneNumber)
          .eq("businessPhoneNumber", args.businessPhoneNumber)
      )
      .first();
  },
});

// Get total unread count for an organization
export const getUnreadCount = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return conversations.reduce((total, conv) => total + conv.unreadCount, 0);
  },
});

// ============================================
// MUTATIONS
// ============================================

// Create outbound message (called before sending via Twilio)
export const sendMessage = mutation({
  args: {
    organizationId: v.id("organizations"),
    to: v.string(),
    from: v.string(), // Business phone number
    body: v.string(),
    mediaUrls: v.optional(v.array(v.string())),
    contactId: v.optional(v.id("contacts")),
    assignedUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find or create conversation
    let conversation = await ctx.db
      .query("conversations")
      .withIndex("by_phone_numbers", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("customerPhoneNumber", args.to)
          .eq("businessPhoneNumber", args.from)
      )
      .first();

    if (!conversation) {
      // Try to find contact by phone number
      let contactId = args.contactId;
      let contactName: string | undefined;

      if (!contactId) {
        const contacts = await ctx.db
          .query("contacts")
          .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
          .collect();

        const normalizedTo = args.to.replace(/\D/g, "").slice(-10);
        const matchingContact = contacts.find((c) =>
          c.phoneNumbers.some(
            (p) => p.number.replace(/\D/g, "").slice(-10) === normalizedTo
          )
        );

        if (matchingContact) {
          contactId = matchingContact._id;
          contactName = `${matchingContact.firstName}${matchingContact.lastName ? " " + matchingContact.lastName : ""}`;
        }
      }

      // Create new conversation
      const conversationId = await ctx.db.insert("conversations", {
        organizationId: args.organizationId,
        customerPhoneNumber: args.to,
        businessPhoneNumber: args.from,
        contactId,
        contactName,
        assignedUserId: args.assignedUserId,
        status: "active",
        lastMessageAt: now,
        lastMessagePreview: args.body.substring(0, 50) + (args.body.length > 50 ? "..." : ""),
        unreadCount: 0, // Outbound messages don't create unread
        createdAt: now,
        updatedAt: now,
      });

      conversation = await ctx.db.get(conversationId);
    } else {
      // Update existing conversation
      await ctx.db.patch(conversation._id, {
        lastMessageAt: now,
        lastMessagePreview: args.body.substring(0, 50) + (args.body.length > 50 ? "..." : ""),
        updatedAt: now,
      });
    }

    // Calculate segment count (SMS = 160 chars, concatenated = 153 chars per segment)
    const segmentCount = args.body.length <= 160 ? 1 : Math.ceil(args.body.length / 153);

    // Create message with "queued" status
    // twilioMessageSid will be updated after Twilio API call
    const messageId = await ctx.db.insert("messages", {
      organizationId: args.organizationId,
      twilioMessageSid: `pending-${now}`, // Temporary, updated after send
      direction: "outbound",
      from: args.from,
      to: args.to,
      body: args.body,
      mediaUrls: args.mediaUrls,
      status: "queued",
      conversationId: conversation!._id,
      contactId: args.contactId,
      assignedUserId: args.assignedUserId,
      segmentCount,
      sentAt: now,
      createdAt: now,
    });

    return {
      messageId,
      conversationId: conversation!._id,
    };
  },
});

// Update message with Twilio SID after sending
export const updateTwilioSid = mutation({
  args: {
    messageId: v.id("messages"),
    twilioMessageSid: v.string(),
    status: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("sending"),
        v.literal("sent"),
        v.literal("delivered"),
        v.literal("failed"),
        v.literal("undelivered")
      )
    ),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {
      twilioMessageSid: args.twilioMessageSid,
    };

    if (args.status) {
      updates.status = args.status;
    }

    await ctx.db.patch(args.messageId, updates);
  },
});

// Receive inbound message (called from webhook)
export const receiveMessage = mutation({
  args: {
    twilioMessageSid: v.string(),
    from: v.string(), // Customer phone
    to: v.string(), // Business phone (Twilio number)
    body: v.string(),
    mediaUrls: v.optional(v.array(v.string())),
    numSegments: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find organization by phone number (the "to" is our Twilio number)
    const phoneConfig = await ctx.db
      .query("phoneNumbers")
      .withIndex("by_phone_number", (q) => q.eq("phoneNumber", args.to))
      .first();

    if (!phoneConfig) {
      console.error(`Inbound SMS to unconfigured number: ${args.to}`);
      return { success: false, reason: "phone_not_configured" };
    }

    const organizationId = phoneConfig.organizationId;

    // Find or create conversation
    let conversation = await ctx.db
      .query("conversations")
      .withIndex("by_phone_numbers", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("customerPhoneNumber", args.from)
          .eq("businessPhoneNumber", args.to)
      )
      .first();

    // Try to find contact by phone number
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();

    const normalizedFrom = args.from.replace(/\D/g, "").slice(-10);
    const matchingContact = contacts.find((c) =>
      c.phoneNumbers.some(
        (p) => p.number.replace(/\D/g, "").slice(-10) === normalizedFrom
      )
    );

    const contactId = matchingContact?._id;
    const contactName = matchingContact
      ? `${matchingContact.firstName}${matchingContact.lastName ? " " + matchingContact.lastName : ""}`
      : undefined;

    if (!conversation) {
      // Create new conversation
      const conversationId = await ctx.db.insert("conversations", {
        organizationId,
        customerPhoneNumber: args.from,
        businessPhoneNumber: args.to,
        contactId,
        contactName,
        status: "active",
        lastMessageAt: now,
        lastMessagePreview: args.body.substring(0, 50) + (args.body.length > 50 ? "..." : ""),
        unreadCount: 1, // New inbound message
        createdAt: now,
        updatedAt: now,
      });

      conversation = await ctx.db.get(conversationId);
    } else {
      // Update existing conversation
      await ctx.db.patch(conversation._id, {
        lastMessageAt: now,
        lastMessagePreview: args.body.substring(0, 50) + (args.body.length > 50 ? "..." : ""),
        unreadCount: conversation.unreadCount + 1,
        contactId: contactId || conversation.contactId,
        contactName: contactName || conversation.contactName,
        updatedAt: now,
      });
    }

    // Create message
    const messageId = await ctx.db.insert("messages", {
      organizationId,
      twilioMessageSid: args.twilioMessageSid,
      direction: "inbound",
      from: args.from,
      to: args.to,
      body: args.body,
      mediaUrls: args.mediaUrls,
      status: "delivered", // Inbound messages are already delivered
      conversationId: conversation!._id,
      contactId,
      segmentCount: args.numSegments || 1,
      sentAt: now,
      deliveredAt: now,
      createdAt: now,
    });

    return {
      success: true,
      messageId,
      conversationId: conversation!._id,
      organizationId,
    };
  },
});

// Update message status from Twilio webhook
export const updateStatus = mutation({
  args: {
    twilioMessageSid: v.string(),
    status: v.string(),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_twilio_sid", (q) => q.eq("twilioMessageSid", args.twilioMessageSid))
      .first();

    if (!message) {
      console.log(`Message not found for status update: ${args.twilioMessageSid}`);
      return { success: false, reason: "message_not_found" };
    }

    const updates: Record<string, unknown> = {};

    // Map Twilio status to our schema status
    const statusMap: Record<string, string> = {
      accepted: "queued",
      queued: "queued",
      sending: "sending",
      sent: "sent",
      delivered: "delivered",
      failed: "failed",
      undelivered: "undelivered",
    };

    const mappedStatus = statusMap[args.status] || args.status;

    // Only update if it's a valid status
    if (["queued", "sending", "sent", "delivered", "failed", "undelivered"].includes(mappedStatus)) {
      updates.status = mappedStatus;
    }

    if (mappedStatus === "delivered" && !message.deliveredAt) {
      updates.deliveredAt = Date.now();
    }

    if (args.errorCode) {
      updates.errorCode = args.errorCode;
    }

    if (args.errorMessage) {
      updates.errorMessage = args.errorMessage;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(message._id, updates);
    }

    return { success: true };
  },
});

// Mark conversation as read (reset unread count)
export const markAsRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      return { success: false, reason: "conversation_not_found" };
    }

    await ctx.db.patch(args.conversationId, {
      unreadCount: 0,
      updatedAt: Date.now(),
    });

    // Also mark all messages in conversation as read
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .filter((q) => q.eq(q.field("direction"), "inbound"))
      .collect();

    const now = Date.now();
    for (const message of messages) {
      if (!message.readAt) {
        await ctx.db.patch(message._id, { readAt: now });
      }
    }

    return { success: true };
  },
});

// Archive a conversation
export const archiveConversation = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, {
      status: "archived",
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

// Mark conversation as spam
export const markAsSpam = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, {
      status: "spam",
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

// Reactivate an archived/spam conversation
export const reactivateConversation = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, {
      status: "active",
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

// Assign conversation to a user
export const assignConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, {
      assignedUserId: args.userId,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});
