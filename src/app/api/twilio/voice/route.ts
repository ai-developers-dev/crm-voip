import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import twilio from "twilio";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { getPlatformRetellApiKey } from "@/lib/retell/platform-key";
import { registerPhoneCall } from "@/lib/retell/client";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";

const VoiceResponse = twilio.twiml.VoiceResponse;


export async function POST(request: NextRequest) {
  let callSid = "unknown";

  try {
    const formData = await request.formData();
    callSid = formData.get("CallSid") as string;
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const direction = formData.get("Direction") as string;

    // Convert FormData to params object for validation
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Validate webhook signature (per-subaccount auth token lookup)
    const isValid = await validateTwilioWebhook(request, params, convex);
    if (!isValid) {
      console.error("[voice] Invalid Twilio webhook signature", { callSid, to });
      // Return TwiML instead of 403 — Twilio shows "application error" for non-XML responses
      const twiml = new VoiceResponse();
      twiml.say(
        { voice: "alice" },
        "We're sorry, this number is temporarily unavailable. Please try again later."
      );
      twiml.hangup();
      return new NextResponse(twiml.toString(), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    const twiml = new VoiceResponse();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    // Check if this is an outbound call from browser client
    // Outbound: from="client:org_xxx-user_xxx" to="+1234567890"
    // Incoming: from="+1234567890" (caller) to="+18556966105" (our number)
    const isOutboundFromBrowser = from && from.startsWith("client:");

    if (isOutboundFromBrowser && to && !to.startsWith("client:")) {
      // Outbound call from browser to PSTN
      // Determine caller ID: use org's configured phone number, not browser client identity
      let callerId = process.env.TWILIO_PHONE_NUMBER || "";
      try {
        // Parse org ID from client identity: "client:org_xxx-user_xxx"
        const clientIdentity = from.replace("client:", "");
        const clerkOrgId = clientIdentity.split("-user_")[0];
        if (clerkOrgId) {
          const org = await convex.query(api.organizations.getCurrent, { clerkOrgId });
          if (org) {
            const phoneNumbers = await convex.query(api.phoneNumbers.getByOrganization, {
              organizationId: org._id,
            });
            if (phoneNumbers.length > 0) {
              callerId = phoneNumbers[0].phoneNumber;
            }
          }
        }
      } catch (err) {
        console.warn("Failed to fetch org phone number for caller ID, using env fallback:", err);
      }

      if (!callerId) {
        console.error("No caller ID available for outbound call");
        twiml.say({ voice: "alice" }, "Unable to place call. Phone system not configured.");
        return new NextResponse(twiml.toString(), {
          headers: { "Content-Type": "text/xml" },
        });
      }

      const dial = twiml.dial({
        callerId,
        timeout: 30,
        action: `${appUrl}/api/twilio/dial-status`,
        record: "record-from-answer-dual",
        recordingStatusCallback: `${appUrl}/api/twilio/recording`,
      });

      dial.number(
        {
          statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
          statusCallback: `${appUrl}/api/twilio/status`,
        },
        to
      );
    } else {
      // Incoming call - OPTIMIZED: Single HTTP call for phone lookup + available agents
      // This eliminates the 2-3 ring delay caused by sequential HTTP calls to Convex

      // Single combined query - replaces sequential lookupByNumber + getAvailableAgents
      const callData = await convex.query(api.calls.getIncomingCallData, {
        phoneNumber: to,
      });

      if (!callData.found) {
        console.error(`Phone number not configured: ${to}`);
        twiml.say(
          { voice: "alice" },
          "Sorry, this number is not configured. Please try again later."
        );
        twiml.hangup();
        return new NextResponse(twiml.toString(), {
          headers: { "Content-Type": "text/xml" },
        });
      }

      // Check if this phone number has an AI agent assigned
      if (callData.aiAgentId) {
        try {
          const retellApiKey = await getPlatformRetellApiKey(convex);
          const agent = await convex.query(api.retellAgents.getById, { id: callData.aiAgentId as Id<"retellAgents"> });
          if (agent && agent.isActive) {
            const registration = await registerPhoneCall(retellApiKey, {
              agent_id: agent.retellAgentId,
              metadata: { organizationId: callData.organizationId, callerNumber: from },
            });

            // Route call to Retell via SIP
            const sipDial = twiml.dial({ timeout: 30 });
            sipDial.sip(`sip:${registration.call_id}@sip.retellai.com`);

            // Fire-and-forget: log AI call
            convex.mutation(api.aiCallHistory.create, {
              organizationId: callData.organizationId as Id<"organizations">,
              retellAgentId: agent.retellAgentId,
              retellCallId: registration.call_id,
              direction: "inbound",
              status: "registered",
              fromNumber: from,
              toNumber: to,
            }).catch(err => console.error("Failed to create AI call record:", err));

            return new NextResponse(twiml.toString(), {
              headers: { "Content-Type": "text/xml" },
            });
          }
        } catch (err) {
          console.error("[AI ROUTING] Failed to route to AI agent, falling back to human agents:", err);
          // Fall through to normal human agent routing
        }
      }

      // Fire-and-forget: Create call record (don't block TwiML response)
      const orgId = callData.organizationId as Id<"organizations">;
      convex.mutation(api.calls.createOrGetIncoming, {
        organizationId: orgId,
        twilioCallSid: callSid,
        from,
        to,
      }).catch(err => console.error("Failed to create call record:", err));

      // ── Per-Number Routing ──────────────────────────────────────────
      const routingType = callData.phoneConfig.routingType || "ring_all";
      const assignedUserId = callData.phoneConfig.assignedUserId;
      const ringGroupUserIds = callData.phoneConfig.ringGroupUserIds;

      let agentsToDial = callData.agents;

      if (routingType === "direct" && assignedUserId) {
        // Direct line: only ring the assigned user
        agentsToDial = callData.agents.filter((a) => a._id === assignedUserId);
      } else if (routingType === "ring_group" && ringGroupUserIds && ringGroupUserIds.length > 0) {
        // Ring group: only ring users in the group
        const groupSet = new Set(ringGroupUserIds as string[]);
        agentsToDial = callData.agents.filter((a) => groupSet.has(a._id));
      }

      if (agentsToDial.length === 0) {
        // No agents available for this routing — go to voicemail
        twiml.say(
          { voice: "alice" },
          routingType === "direct"
            ? "The person you are trying to reach is not available. Please leave a message after the beep."
            : "We are sorry, but all of our agents are currently busy. Please leave a message after the beep."
        );
        twiml.record({
          timeout: 3,
          transcribe: true,
          maxLength: 120,
          transcribeCallback: `${appUrl}/api/twilio/transcription`,
        });
        twiml.say({ voice: "alice" }, "Thank you for your message. Goodbye.");
        twiml.hangup();

        return new NextResponse(twiml.toString(), {
          headers: { "Content-Type": "text/xml" },
        });
      }

      // Dial filtered agents — configurable timeout from phone config
      const ringTimeout = callData.phoneConfig.unansweredTimeoutSeconds || 30;
      const phoneId = callData.phoneConfig._id || "";
      const dial = twiml.dial({
        timeout: ringTimeout,
        callerId: from,
        action: `${appUrl}/api/twilio/dial-status?phoneId=${phoneId}&orgId=${callData.organizationId}`,
      });

      for (const agent of agentsToDial) {
        dial.client(agent.twilioIdentity);
      }
    }

    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[${errorId}] Voice webhook error:`, {
      callSid,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Return TwiML error message (always return valid TwiML for voice)
    const twiml = new VoiceResponse();
    twiml.say("We're sorry, an error occurred. Please try your call again.");
    twiml.hangup();

    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}

// Also handle GET for testing
export async function GET() {
  const twiml = new VoiceResponse();
  twiml.say("Voice webhook is working");

  return new NextResponse(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
