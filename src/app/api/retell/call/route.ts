import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getPlatformRetellApiKey } from "@/lib/retell/platform-key";
import { registerPhoneCall } from "@/lib/retell/client";
import twilio from "twilio";

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
      dynamicVariables,
    } = body;

    if (!organizationId || !retellAgentId || !toNumber) {
      return NextResponse.json(
        { error: "Missing required fields: organizationId, retellAgentId, toNumber" },
        { status: 400 }
      );
    }

    // 1. Get platform Retell API key
    const apiKey = await getPlatformRetellApiKey(convex);

    // 2. Get the agent from Convex
    const agent = await convex.query(api.retellAgents.getById, {
      id: retellAgentId as Id<"retellAgents">,
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // 3. Register the call with Retell (get SIP URI)
    const registration = await registerPhoneCall(apiKey, {
      agent_id: agent.retellAgentId,
      metadata: { organizationId, contactId },
      retell_llm_dynamic_variables: dynamicVariables || undefined,
    });

    // 4. Get tenant's Twilio credentials
    const org = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<"organizations">,
    });
    if (!org?.settings?.twilioCredentials) {
      return NextResponse.json(
        { error: "Twilio credentials not configured for this organization" },
        { status: 400 }
      );
    }
    const twilioSettings = org.settings.twilioCredentials;

    // 5. Get tenant's phone number
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

    // 6. Make outbound call via Twilio using SIP URI
    const twilioClient = twilio(
      twilioSettings.accountSid,
      twilioSettings.authToken
    );
    const call = await twilioClient.calls.create({
      to: toNumber,
      from: activePhone.phoneNumber,
      twiml: `<Response><Dial><Sip>sip:${registration.call_id}@sip.retellai.com</Sip></Dial></Response>`,
    });

    // 7. Save to aiCallHistory
    const callId = await convex.mutation(api.aiCallHistory.create, {
      organizationId: organizationId as Id<"organizations">,
      retellAgentId: agent.retellAgentId,
      retellCallId: registration.call_id,
      direction: "outbound",
      status: "registered",
      fromNumber: activePhone.phoneNumber,
      toNumber,
      contactId: contactId
        ? (contactId as Id<"contacts">)
        : undefined,
    });

    return NextResponse.json({
      success: true,
      callId,
      retellCallId: registration.call_id,
      twilioCallSid: call.sid,
    });
  } catch (err: any) {
    console.error("[retell-call] POST error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to initiate call" },
      { status: 500 }
    );
  }
}
