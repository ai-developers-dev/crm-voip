import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { createPhoneCall } from "@/lib/retell/client";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      organizationId,
      retellAgentId, // Convex ID
      toNumber,
      contactId,
      metadata,
      dynamicVariables,
    } = body;

    if (!organizationId || !retellAgentId || !toNumber) {
      return NextResponse.json(
        { error: "Missing required fields: organizationId, retellAgentId, toNumber" },
        { status: 400 }
      );
    }

    // Get org and decrypt API key
    const org = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<"organizations">,
    });
    if (!org?.settings?.retellApiKey) {
      return NextResponse.json(
        { error: "Retell API key not configured" },
        { status: 400 }
      );
    }
    const apiKey = decrypt(org.settings.retellApiKey, organizationId);

    // Get agent record from Convex
    const agent = await convex.query(api.retellAgents.getById, {
      agentId: retellAgentId as Id<"retellAgents">,
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Get a phone number for the org (first active one)
    const phoneNumbers = await convex.query(api.phoneNumbers.getByOrganization, {
      organizationId: organizationId as Id<"organizations">,
    });
    const activePhone = phoneNumbers?.find((p: any) => p.isActive);
    if (!activePhone) {
      return NextResponse.json(
        { error: "No active phone number found for this organization" },
        { status: 400 }
      );
    }

    // Create phone call via Retell API
    const callResponse = await createPhoneCall(apiKey, {
      from_number: activePhone.phoneNumber,
      to_number: toNumber,
      override_agent_id: agent.retellAgentId,
      metadata: metadata || undefined,
      retell_llm_dynamic_variables: dynamicVariables || undefined,
    });

    // Create aiCallHistory record
    const callId = await convex.mutation(api.aiCallHistory.create, {
      organizationId: organizationId as Id<"organizations">,
      retellAgentId: agent.retellAgentId,
      retellCallId: callResponse.call_id,
      direction: "outbound",
      status: "registered",
      fromNumber: activePhone.phoneNumber,
      toNumber,
      contactId: contactId
        ? (contactId as Id<"contacts">)
        : undefined,
      createdAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
      callId,
      retellCallId: callResponse.call_id,
    });
  } catch (err: any) {
    console.error("[retell-call] POST error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to initiate call" },
      { status: 500 }
    );
  }
}
