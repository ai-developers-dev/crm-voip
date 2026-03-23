import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/** Check if a contact has an active AI SMS conversation */
export const getActiveConversation = internalQuery({
  args: {
    contactId: v.id("contacts"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const conversations = await ctx.db
      .query("smsAgentConversations")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
    return conversations.find(
      (c) => c.organizationId === args.organizationId && c.status === "active"
    ) || null;
  },
});

/** Start a new AI SMS conversation */
export const startConversation = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    smsAgentId: v.id("smsAgents"),
    conversationId: v.optional(v.id("conversations")),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.smsAgentId);
    if (!agent || !agent.isActive) throw new Error("SMS agent not found or inactive");

    // Check for existing active conversation
    const existing = await ctx.db
      .query("smsAgentConversations")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
    const active = existing.find(
      (c) => c.organizationId === args.organizationId && c.status === "active"
    );
    if (active) return active._id; // Already has an active conversation

    const now = Date.now();
    const conversationId = await ctx.db.insert("smsAgentConversations", {
      organizationId: args.organizationId,
      smsAgentId: args.smsAgentId,
      contactId: args.contactId,
      conversationId: args.conversationId,
      status: "active",
      turnCount: 0,
      aiMessages: [{
        role: "system",
        content: agent.systemPrompt,
        timestamp: now,
      }],
      workflowExecutionId: args.workflowExecutionId,
      startedAt: now,
    });

    // If agent has a begin message, schedule sending it
    if (agent.beginMessage) {
      await ctx.scheduler.runAfter(0, internal.smsAiEngine.sendAiMessage, {
        agentConversationId: conversationId,
        message: agent.beginMessage,
      });
    }

    return conversationId;
  },
});

/** Record an incoming user message and trigger AI response */
export const addUserMessage = internalMutation({
  args: {
    agentConversationId: v.id("smsAgentConversations"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.agentConversationId);
    if (!conversation || conversation.status !== "active") return;

    const agent = await ctx.db.get(conversation.smsAgentId);
    if (!agent) return;

    // Check max turns
    if (agent.maxTurns && conversation.turnCount >= agent.maxTurns) {
      await ctx.db.patch(args.agentConversationId, {
        status: "expired",
        completedAt: Date.now(),
      });
      return;
    }

    // Add user message to history
    const updatedMessages = [
      ...conversation.aiMessages,
      { role: "user", content: args.message, timestamp: Date.now() },
    ];

    await ctx.db.patch(args.agentConversationId, {
      aiMessages: updatedMessages,
      turnCount: conversation.turnCount + 1,
    });

    // Schedule AI response generation (calls Next.js API route which calls OpenAI)
    await ctx.scheduler.runAfter(0, internal.smsAiEngine.requestAiResponse, {
      agentConversationId: args.agentConversationId,
    });
  },
});

/** Request AI response — schedules the HTTP action */
export const requestAiResponse = internalMutation({
  args: { agentConversationId: v.id("smsAgentConversations") },
  handler: async (ctx, args) => {
    // This will be called by the Next.js API route after OpenAI responds
    // The actual OpenAI call happens in /api/sms/ai/route.ts
    // We just mark that we're waiting for a response
  },
});

/** Save AI response and send SMS */
export const saveAiResponse = internalMutation({
  args: {
    agentConversationId: v.id("smsAgentConversations"),
    message: v.string(),
    toolCalls: v.optional(v.any()),
    tokensUsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.agentConversationId);
    if (!conversation) return;

    const updatedMessages = [
      ...conversation.aiMessages,
      {
        role: "assistant",
        content: args.message,
        toolCalls: args.toolCalls,
        timestamp: Date.now(),
      },
    ];

    await ctx.db.patch(args.agentConversationId, {
      aiMessages: updatedMessages,
      totalTokensUsed: (conversation.totalTokensUsed || 0) + (args.tokensUsed || 0),
    });
  },
});

/** Send an AI-generated SMS to the contact */
export const sendAiMessage = internalMutation({
  args: {
    agentConversationId: v.id("smsAgentConversations"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.agentConversationId);
    if (!conversation) return;

    const contact = await ctx.db.get(conversation.contactId);
    if (!contact) return;

    // Check DND
    if (contact.smsOptedOut) {
      await ctx.db.patch(args.agentConversationId, {
        status: "expired",
        handoffReason: "Contact opted out of SMS",
        completedAt: Date.now(),
      });
      return;
    }

    // Get org phone number
    const phoneNumber = await ctx.db
      .query("phoneNumbers")
      .withIndex("by_organization", (q) => q.eq("organizationId", conversation.organizationId))
      .first();

    if (!phoneNumber) return;

    const primaryPhone = contact.phoneNumbers.find((p) => p.isPrimary) || contact.phoneNumbers[0];
    if (!primaryPhone) return;

    // Send via Twilio (using the SMS send infrastructure)
    const org = await ctx.db.get(conversation.organizationId);
    const twilioAccountSid = org?.settings?.twilioCredentials?.accountSid;
    const twilioAuthToken = org?.settings?.twilioCredentials?.authToken;

    if (!twilioAccountSid || !twilioAuthToken) return;

    // Schedule the actual SMS send as an action (needs network access)
    await ctx.scheduler.runAfter(0, internal.smsAiEngine.executeSendSms, {
      agentConversationId: args.agentConversationId,
      to: primaryPhone.number,
      from: phoneNumber.phoneNumber,
      body: args.message,
      accountSid: twilioAccountSid,
      authToken: twilioAuthToken,
      organizationId: conversation.organizationId,
      contactId: conversation.contactId,
    });
  },
});

/** Actually send SMS via Twilio (action — has network access) */
import { internalAction } from "./_generated/server";

export const executeSendSms = internalAction({
  args: {
    agentConversationId: v.id("smsAgentConversations"),
    to: v.string(),
    from: v.string(),
    body: v.string(),
    accountSid: v.string(),
    authToken: v.string(),
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${args.accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${args.accountSid}:${args.authToken}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: args.to,
            From: args.from,
            Body: args.body,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        console.error("AI SMS send failed:", err);
        return;
      }

      const result = await response.json();

      // Store the message in conversations table
      await ctx.runMutation(internal.smsAiEngine.storeAiSmsMessage, {
        organizationId: args.organizationId,
        contactId: args.contactId,
        to: args.to,
        from: args.from,
        body: args.body,
        twilioMessageSid: result.sid,
        agentConversationId: args.agentConversationId,
      });
    } catch (error: any) {
      console.error("AI SMS send error:", error.message);
    }
  },
});

/** Store the AI's outbound SMS in the conversations/messages table */
export const storeAiSmsMessage = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    to: v.string(),
    from: v.string(),
    body: v.string(),
    twilioMessageSid: v.string(),
    agentConversationId: v.id("smsAgentConversations"),
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
      const contact = await ctx.db.get(args.contactId);
      const convId = await ctx.db.insert("conversations", {
        organizationId: args.organizationId,
        customerPhoneNumber: args.to,
        businessPhoneNumber: args.from,
        contactId: args.contactId,
        contactName: contact ? `${contact.firstName} ${contact.lastName || ""}`.trim() : undefined,
        status: "active",
        lastMessageAt: now,
        lastMessagePreview: args.body.substring(0, 50),
        unreadCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      conversation = await ctx.db.get(convId);
    }

    if (conversation) {
      await ctx.db.insert("messages", {
        conversationId: conversation._id,
        organizationId: args.organizationId,
        twilioMessageSid: args.twilioMessageSid,
        direction: "outbound",
        from: args.from,
        to: args.to,
        body: args.body,
        status: "sent",
        segmentCount: Math.ceil(args.body.length / 160),
        sentAt: now,
        createdAt: now,
        isAiGenerated: true,
      });

      await ctx.db.patch(conversation._id, {
        lastMessageAt: now,
        lastMessagePreview: `[AI] ${args.body.substring(0, 40)}`,
        updatedAt: now,
      });

      // Link AI conversation to SMS conversation
      await ctx.db.patch(args.agentConversationId, {
        conversationId: conversation._id,
      });
    }
  },
});

/** Hand off conversation to a human */
export const handoffToHuman = internalMutation({
  args: {
    agentConversationId: v.id("smsAgentConversations"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.agentConversationId);
    if (!conversation) return;

    const agent = await ctx.db.get(conversation.smsAgentId);

    await ctx.db.patch(args.agentConversationId, {
      status: "handed_off",
      handoffReason: args.reason || "AI requested human assistance",
      completedAt: Date.now(),
    });

    // Send handoff message if configured
    if (agent?.handoffMessage) {
      await ctx.scheduler.runAfter(0, internal.smsAiEngine.sendAiMessage, {
        agentConversationId: args.agentConversationId,
        message: agent.handoffMessage,
      });
    }
  },
});

/** Mark conversation as completed (objective achieved) */
export const completeConversation = internalMutation({
  args: {
    agentConversationId: v.id("smsAgentConversations"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.agentConversationId);
    if (!conversation) return;

    const agent = await ctx.db.get(conversation.smsAgentId);

    await ctx.db.patch(args.agentConversationId, {
      status: "completed",
      objectiveAchieved: true,
      completedAt: Date.now(),
    });

    // Send completion message if configured
    if (agent?.completionMessage) {
      await ctx.scheduler.runAfter(0, internal.smsAiEngine.sendAiMessage, {
        agentConversationId: args.agentConversationId,
        message: agent.completionMessage,
      });
    }
  },
});
