import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  createRetellLlm,
  createAgent,
  updateRetellLlm,
  updateAgent,
  deleteAgent,
} from "@/lib/retell/client";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** Helper: get decrypted Retell API key for an org */
async function getApiKey(organizationId: string): Promise<string> {
  const org = await convex.query(api.organizations.getById, {
    organizationId: organizationId as Id<"organizations">,
  });
  if (!org?.settings?.retellApiKey) {
    throw new Error("Retell API key not configured for this organization");
  }
  return decrypt(org.settings.retellApiKey, organizationId);
}

export async function GET(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing organizationId" },
        { status: 400 }
      );
    }

    const agents = await convex.query(api.retellAgents.getByOrganization, {
      organizationId: organizationId as Id<"organizations">,
    });

    return NextResponse.json({ agents });
  } catch (err: any) {
    console.error("[retell-agents] GET error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to list agents" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      organizationId,
      name,
      type,
      description,
      voiceId,
      language,
      generalPrompt,
      beginMessage,
      model,
      modelTemperature,
      responsiveness,
      interruptionSensitivity,
      enableBackchannel,
      enableTransferToHuman,
      transferPhoneNumber,
      enableVoicemailDetection,
      voicemailMessage,
      analysisSummaryPrompt,
      analysisSuccessPrompt,
      postCallAnalysisFields,
    } = body;

    if (!organizationId || !name || !voiceId || !generalPrompt) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const apiKey = await getApiKey(organizationId);

    // Build general_tools array
    const generalTools: any[] = [{ type: "end_call" }];
    if (enableTransferToHuman && transferPhoneNumber) {
      generalTools.push({
        type: "transfer_call",
        number: transferPhoneNumber,
        description: "Transfer to human agent",
      });
    }

    // 1. Create the LLM
    const llmResponse = await createRetellLlm(apiKey, {
      model: model || "gpt-4o",
      general_prompt: generalPrompt,
      begin_message: beginMessage || null,
      model_temperature: modelTemperature ?? 0.7,
      general_tools: generalTools,
    });

    // 2. Create the agent
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/retell/webhook`;
    const agentResponse = await createAgent(apiKey, {
      response_engine: {
        type: "retell-llm",
        llm_id: llmResponse.llm_id,
      },
      voice_id: voiceId,
      agent_name: name,
      language: language || "en-US",
      webhook_url: webhookUrl,
      responsiveness: responsiveness ?? 1,
      interruption_sensitivity: interruptionSensitivity ?? 1,
      enable_backchannel: enableBackchannel ?? false,
      enable_voicemail_detection: enableVoicemailDetection ?? false,
      voicemail_message: voicemailMessage || undefined,
      post_call_analysis_data: postCallAnalysisFields || undefined,
    });

    // 3. Save to Convex
    const agentId = await convex.mutation(api.retellAgents.create, {
      organizationId: organizationId as Id<"organizations">,
      retellAgentId: agentResponse.agent_id,
      retellLlmId: llmResponse.llm_id,
      name,
      type: type || "outbound",
      description: description || undefined,
      isActive: true,
      voiceId,
      language: language || "en-US",
      generalPrompt,
      beginMessage: beginMessage || undefined,
      model: model || "gpt-4o",
      modelTemperature: modelTemperature ?? 0.7,
      responsiveness: responsiveness ?? 1,
      interruptionSensitivity: interruptionSensitivity ?? 1,
      enableBackchannel: enableBackchannel ?? false,
      enableTransferToHuman: enableTransferToHuman ?? false,
      transferPhoneNumber: transferPhoneNumber || undefined,
      enableVoicemailDetection: enableVoicemailDetection ?? false,
      voicemailMessage: voicemailMessage || undefined,
      analysisSummaryPrompt: analysisSummaryPrompt || undefined,
      analysisSuccessPrompt: analysisSuccessPrompt || undefined,
      postCallAnalysisFields: postCallAnalysisFields || undefined,
      webhookUrl,
    });

    return NextResponse.json({
      success: true,
      agentId,
      retellAgentId: agentResponse.agent_id,
      retellLlmId: llmResponse.llm_id,
    });
  } catch (err: any) {
    console.error("[retell-agents] POST error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to create agent" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { organizationId, agentId, ...updates } = body;

    if (!organizationId || !agentId) {
      return NextResponse.json(
        { error: "Missing organizationId or agentId" },
        { status: 400 }
      );
    }

    const apiKey = await getApiKey(organizationId);

    // Get existing agent from Convex
    const existingAgent = await convex.query(api.retellAgents.getById, {
      agentId: agentId as Id<"retellAgents">,
    });
    if (!existingAgent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Build updated general_tools
    const enableTransferToHuman =
      updates.enableTransferToHuman ?? existingAgent.enableTransferToHuman;
    const transferPhoneNumber =
      updates.transferPhoneNumber ?? existingAgent.transferPhoneNumber;
    const generalTools: any[] = [{ type: "end_call" }];
    if (enableTransferToHuman && transferPhoneNumber) {
      generalTools.push({
        type: "transfer_call",
        number: transferPhoneNumber,
        description: "Transfer to human agent",
      });
    }

    // Update LLM if we have an llmId
    if (existingAgent.retellLlmId) {
      await updateRetellLlm(apiKey, existingAgent.retellLlmId, {
        model: updates.model ?? existingAgent.model,
        general_prompt: updates.generalPrompt ?? existingAgent.generalPrompt,
        begin_message: updates.beginMessage ?? existingAgent.beginMessage ?? null,
        model_temperature:
          updates.modelTemperature ?? existingAgent.modelTemperature ?? 0.7,
        general_tools: generalTools,
      });
    }

    // Update agent on Retell
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/retell/webhook`;
    await updateAgent(apiKey, existingAgent.retellAgentId, {
      voice_id: updates.voiceId ?? existingAgent.voiceId,
      agent_name: updates.name ?? existingAgent.name,
      language: updates.language ?? existingAgent.language ?? "en-US",
      webhook_url: webhookUrl,
      responsiveness:
        updates.responsiveness ?? existingAgent.responsiveness ?? 1,
      interruption_sensitivity:
        updates.interruptionSensitivity ??
        existingAgent.interruptionSensitivity ??
        1,
      enable_backchannel:
        updates.enableBackchannel ?? existingAgent.enableBackchannel ?? false,
      enable_voicemail_detection:
        updates.enableVoicemailDetection ??
        existingAgent.enableVoicemailDetection ??
        false,
      voicemail_message:
        updates.voicemailMessage ??
        existingAgent.voicemailMessage ??
        undefined,
      post_call_analysis_data:
        updates.postCallAnalysisFields ??
        existingAgent.postCallAnalysisFields ??
        undefined,
    });

    // Update in Convex
    await convex.mutation(api.retellAgents.update, {
      agentId: agentId as Id<"retellAgents">,
      ...updates,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[retell-agents] PATCH error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to update agent" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    const agentId = searchParams.get("agentId");

    if (!organizationId || !agentId) {
      return NextResponse.json(
        { error: "Missing organizationId or agentId" },
        { status: 400 }
      );
    }

    const apiKey = await getApiKey(organizationId);

    // Get agent from Convex
    const agent = await convex.query(api.retellAgents.getById, {
      agentId: agentId as Id<"retellAgents">,
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Delete from Retell API
    await deleteAgent(apiKey, agent.retellAgentId);

    // Remove from Convex
    await convex.mutation(api.retellAgents.remove, {
      agentId: agentId as Id<"retellAgents">,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[retell-agents] DELETE error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to delete agent" },
      { status: 500 }
    );
  }
}
