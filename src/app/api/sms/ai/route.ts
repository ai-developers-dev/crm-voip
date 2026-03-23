import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import OpenAI from "openai";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** Process an incoming SMS for an AI agent conversation */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      agentConversationId,
      incomingMessage,
      organizationId,
      contactId,
    } = body;

    if (!agentConversationId || !incomingMessage) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Add user message to conversation
    await convex.mutation(api.smsAgents.addUserMessage, {
      agentConversationId: agentConversationId as Id<"smsAgentConversations">,
      message: incomingMessage,
    });

    // Get conversation with updated messages
    const conversation = await convex.query(api.smsAgents.getConversationById, {
      conversationId: agentConversationId as Id<"smsAgentConversations">,
    });
    if (!conversation || conversation.status !== "active") {
      return NextResponse.json({ ok: true, status: "conversation_ended" });
    }

    // Get agent config
    const agent = await convex.query(api.smsAgents.getById, {
      agentId: conversation.smsAgentId,
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Get contact info for context
    const contact = await convex.query(api.contacts.getById, {
      contactId: conversation.contactId,
    });

    // Build OpenAI messages from conversation history
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = conversation.aiMessages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    }));

    // Add contact context to system prompt
    if (contact) {
      const contactContext = `\n\nContact information:\n- Name: ${contact.firstName} ${contact.lastName || ""}\n- Email: ${contact.email || "not provided"}\n- Phone: ${contact.phoneNumbers?.[0]?.number || "unknown"}`;
      if (openaiMessages[0]?.role === "system") {
        openaiMessages[0].content += contactContext;
      }
    }

    // Define available tools based on agent config
    const tools = buildToolDefinitions(agent.enabledTools || []);

    // Get OpenAI API key from platform org settings (stored in Convex)
    const platformOrg = await convex.query(api.organizations.getPlatformOrg, {});
    const openaiApiKey = (platformOrg?.settings as any)?.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured. Add it in Platform Settings > AI Agents." }, { status: 500 });
    }

    // Call OpenAI
    const openai = new OpenAI({ apiKey: openaiApiKey });
    const completion = await openai.chat.completions.create({
      model: agent.model || "gpt-4.1-mini",
      temperature: agent.temperature ?? 0.7,
      messages: openaiMessages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: 300, // SMS-appropriate length
    });

    const choice = completion.choices[0];
    const tokensUsed = (completion.usage?.total_tokens || 0);

    // Handle tool calls
    const toolCalls = (choice.message as any).tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        const args = JSON.parse(toolCall.function.arguments);
        await executeToolCall(
          toolCall.function.name,
          args,
          agentConversationId as Id<"smsAgentConversations">,
          conversation.organizationId,
          conversation.contactId
        );
      }

      // If there's also a text response, send it
      if (choice.message.content) {
        await convex.mutation(api.smsAgents.saveAiResponse, {
          agentConversationId: agentConversationId as Id<"smsAgentConversations">,
          message: choice.message.content,
          toolCalls: toolCalls,
          tokensUsed,
        });
        await convex.mutation(api.smsAgents.sendAiMessage, {
          agentConversationId: agentConversationId as Id<"smsAgentConversations">,
          message: choice.message.content,
        });
      }
    } else if (choice.message.content) {
      // Regular text response — save and send
      await convex.mutation(api.smsAgents.saveAiResponse, {
        agentConversationId: agentConversationId as Id<"smsAgentConversations">,
        message: choice.message.content,
        tokensUsed,
      });
      await convex.mutation(api.smsAgents.sendAiMessage, {
        agentConversationId: agentConversationId as Id<"smsAgentConversations">,
        message: choice.message.content,
      });
    }

    return NextResponse.json({ ok: true, tokensUsed });
  } catch (error: any) {
    console.error("AI SMS error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Build OpenAI tool definitions based on enabled tools */
function buildToolDefinitions(enabledTools: string[]): OpenAI.ChatCompletionTool[] {
  const allTools: Record<string, OpenAI.ChatCompletionTool> = {
    book_appointment: {
      type: "function",
      function: {
        name: "book_appointment",
        description: "Book an appointment for the contact. Use when the customer confirms they want to schedule a meeting or call.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Title of the appointment" },
            date: { type: "string", description: "Date and time in ISO 8601 format (e.g., 2026-03-20T14:00:00)" },
            duration_minutes: { type: "number", description: "Duration in minutes (default 30)" },
            type: { type: "string", enum: ["meeting", "call", "video", "other"], description: "Type of appointment" },
          },
          required: ["title", "date"],
        },
      },
    },
    tag_contact: {
      type: "function",
      function: {
        name: "tag_contact",
        description: "Add a tag to the contact for tracking purposes",
        parameters: {
          type: "object",
          properties: {
            tag_name: { type: "string", description: "Name of the tag to add" },
          },
          required: ["tag_name"],
        },
      },
    },
    transfer_to_human: {
      type: "function",
      function: {
        name: "transfer_to_human",
        description: "Transfer the conversation to a human agent. Use when the customer requests to speak with a person, or when you cannot handle their request.",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string", description: "Reason for the transfer" },
          },
          required: ["reason"],
        },
      },
    },
    end_conversation: {
      type: "function",
      function: {
        name: "end_conversation",
        description: "End the conversation. Use when the objective has been achieved or the customer indicates they're done.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Brief summary of what was accomplished" },
          },
        },
      },
    },
    create_task: {
      type: "function",
      function: {
        name: "create_task",
        description: "Create a follow-up task for the team",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Task title" },
            description: { type: "string", description: "Task description" },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          },
          required: ["title"],
        },
      },
    },
  };

  return enabledTools
    .filter((t) => allTools[t])
    .map((t) => allTools[t]);
}

/** Execute a tool call from the AI */
async function executeToolCall(
  toolName: string,
  args: any,
  agentConversationId: Id<"smsAgentConversations">,
  organizationId: Id<"organizations">,
  contactId: Id<"contacts">
) {
  switch (toolName) {
    case "book_appointment": {
      const startTime = new Date(args.date).getTime();
      const durationMs = (args.duration_minutes || 30) * 60000;
      const aptType = (["meeting", "call", "video", "other"] as const).includes(args.type) ? args.type : "meeting";
      // Use the AI-specific appointment creator (no auth context needed)
      await convex.mutation(api.smsAgents.createAppointmentFromAi, {
        organizationId,
        contactId,
        title: args.title,
        appointmentDate: startTime,
        endDate: startTime + durationMs,
        type: aptType,
      });
      break;
    }
    case "transfer_to_human": {
      await convex.mutation(api.smsAgents.handoffToHuman, {
        agentConversationId,
        reason: args.reason,
      });
      break;
    }
    case "end_conversation": {
      await convex.mutation(api.smsAgents.completeConversation, {
        agentConversationId,
      });
      break;
    }
    case "create_task": {
      await convex.mutation(api.smsAgents.createTaskFromAi, {
        organizationId,
        contactId,
        title: args.title,
        description: args.description,
        priority: args.priority || "medium",
      });
      break;
    }
  }
}
