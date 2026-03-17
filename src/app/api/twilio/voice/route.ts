import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { getPlatformRetellApiKey } from "@/lib/retell/platform-key";
import { registerPhoneCall } from "@/lib/retell/client";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";

const VoiceResponse = twilio.twiml.VoiceResponse;

// Convex HTTP client for database operations
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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
      console.error("Invalid Twilio webhook signature for voice webhook");
      return new NextResponse("Forbidden", { status: 403 });
    }

    console.log(`Voice webhook: ${callSid} from ${from} to ${to} (${direction})`);

    const twiml = new VoiceResponse();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    // Check if this is an outbound call from browser client
    // Outbound: from="client:org_xxx-user_xxx" to="+1234567890"
    // Incoming: from="+1234567890" (caller) to="+18556966105" (our number)
    const isOutboundFromBrowser = from && from.startsWith("client:");

    if (isOutboundFromBrowser && to && !to.startsWith("client:")) {
      // Outbound call from browser to PSTN
      const dial = twiml.dial({
        callerId: process.env.TWILIO_PHONE_NUMBER || from,
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
      console.log(`[PERF] Starting incoming call processing for: ${to}`);
      const startTime = Date.now();

      // Single combined query - replaces sequential lookupByNumber + getAvailableAgents
      const callData = await convex.query(api.calls.getIncomingCallData, {
        phoneNumber: to,
      });

      console.log(`[PERF] getIncomingCallData took ${Date.now() - startTime}ms`);

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

      console.log(`Found organization: ${callData.organizationId}, ${callData.agents.length} available agents`);

      // Check if this phone number has an AI agent assigned
      if (callData.aiAgentId) {
        try {
          const retellApiKey = await getPlatformRetellApiKey(convex);
          const agent = await convex.query(api.retellAgents.getById, { id: callData.aiAgentId as Id<"retellAgents"> });
          if (agent && agent.isActive) {
            console.log(`[AI ROUTING] Routing to AI agent: ${agent.name} (${agent.retellAgentId})`);
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

      if (callData.agents.length === 0) {
        // No agents available - go to voicemail
        console.log("No agents available - sending to voicemail");
        twiml.say(
          { voice: "alice" },
          "We are sorry, but all of our agents are currently busy. Please leave a message after the beep."
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

      // Dial ALL available agents simultaneously
      // First to answer wins, others stop ringing
      const dial = twiml.dial({
        timeout: 30,
        callerId: from,
        action: `${appUrl}/api/twilio/dial-status`,
      });

      // Add each agent as a Client element - Twilio rings all simultaneously
      // IMPORTANT: Client identity must match the token identity format: ${clerkOrgId}-${clerkUserId}
      for (const agent of callData.agents) {
        console.log(`Adding agent to dial: ${agent.name} (${agent.twilioIdentity})`);
        dial.client(agent.twilioIdentity);
      }

      console.log(`[PERF] Total webhook processing: ${Date.now() - startTime}ms`);
    }

    const twimlString = twiml.toString();
    console.log("Returning TwiML:", twimlString.substring(0, 200) + "...");

    return new NextResponse(twimlString, {
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
