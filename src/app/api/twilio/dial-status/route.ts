import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import twilio from "twilio";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";
import { getPlatformRetellApiKey } from "@/lib/retell/platform-key";
import { registerPhoneCall } from "@/lib/retell/client";

const VoiceResponse = twilio.twiml.VoiceResponse;


export async function POST(request: NextRequest) {
  let callSid = "unknown";

  try {
    const formData = await request.formData();
    callSid = formData.get("CallSid") as string;
    const dialCallStatus = formData.get("DialCallStatus") as string;
    const dialCallDuration = formData.get("DialCallDuration") as string;
    const from = formData.get("From") as string;

    // Convert FormData to params object for validation
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Validate webhook signature (per-subaccount auth token lookup)
    const isValid = await validateTwilioWebhook(request, params, convex);
    if (!isValid) {
      console.error("Invalid Twilio webhook signature for dial-status");
      return new NextResponse("Forbidden", { status: 403 });
    }

    console.log(`Dial status: ${callSid} -> ${dialCallStatus} (duration: ${dialCallDuration}s)`);

    const twiml = new VoiceResponse();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    // Handle different dial outcomes
    switch (dialCallStatus) {
      case "completed":
        // Call was answered by an agent
        console.log("Call completed successfully - agent answered");
        // Update call status in database
        await convex.mutation(api.calls.updateStatusFromWebhook, {
          twilioCallSid: callSid,
          state: "ended",
          outcome: "answered",
          duration: parseInt(dialCallDuration) || 0,
        });
        break;

      case "no-answer":
      case "busy":
      case "failed": {
        // No agent answered — check fallback preference
        const url = new URL(request.url);
        const phoneId = url.searchParams.get("phoneId");
        const orgId = url.searchParams.get("orgId");

        let unansweredAction = "voicemail";
        let voicemailGreeting = "We are sorry, but all of our agents are currently unavailable. Please leave a message after the beep.";
        let unansweredAiAgentId: string | null = null;

        // Look up phone config for fallback settings
        if (phoneId) {
          try {
            const phoneConfig = await convex.query(api.phoneNumbers.getById, {
              id: phoneId as Id<"phoneNumbers">,
            });
            if (phoneConfig) {
              unansweredAction = phoneConfig.unansweredAction || "voicemail";
              if (phoneConfig.voicemailGreeting) voicemailGreeting = phoneConfig.voicemailGreeting;
              unansweredAiAgentId = phoneConfig.unansweredAiAgentId || null;
            }
          } catch (err) {
            console.error("Failed to fetch phone config for fallback:", err);
          }
        }

        console.log(`No agent answered (${dialCallStatus}) — fallback: ${unansweredAction}`);

        if (unansweredAction === "parking" && orgId) {
          // ── AUTO-PARK: Put caller in a conference with hold music ──
          const conferenceName = `auto-park-${callSid}-${Date.now()}`;
          twiml.say({ voice: "alice" }, "Please hold while we find someone to help you.");
          const dialConf = twiml.dial();
          dialConf.conference(
            {
              waitUrl: "https://twimlets.com/holdmusic?Bucket=com.twilio.music.classical",
              waitMethod: "GET",
              startConferenceOnEnter: false,
              endConferenceOnExit: false,
              statusCallback: `${appUrl}/api/twilio/parking-status?conference=${encodeURIComponent(conferenceName)}`,
              statusCallbackEvent: "end leave" as any,
            },
            conferenceName
          );

          // Create parking slot
          convex.mutation(api.parkingLot.autopark, {
            organizationId: orgId as Id<"organizations">,
            conferenceName,
            pstnCallSid: callSid,
            callerNumber: from || "Unknown",
            callerName: undefined,
          }).catch((err) => console.error("Failed to autopark:", err));

          // Update call as parked (not ended)
          await convex.mutation(api.calls.updateStatusFromWebhook, {
            twilioCallSid: callSid,
            state: "parked",
            outcome: "missed",
          }).catch(() => {});

        } else if (unansweredAction === "ai_agent" && unansweredAiAgentId) {
          // ── AI AGENT: Route to Retell AI ──
          try {
            const retellApiKey = await getPlatformRetellApiKey(convex);
            const agent = await convex.query(api.retellAgents.getById, {
              id: unansweredAiAgentId as Id<"retellAgents">,
            });

            if (agent && agent.isActive) {
              console.log(`[AI FALLBACK] Routing to AI agent: ${agent.name}`);
              const registration = await registerPhoneCall(retellApiKey, {
                agent_id: agent.retellAgentId,
                metadata: { organizationId: orgId, callerNumber: from, fallback: true },
              });

              const sipDial = twiml.dial({ timeout: 60 });
              sipDial.sip(`sip:${registration.call_id}@sip.retellai.com`);

              // Log AI call
              if (orgId) {
                convex.mutation(api.aiCallHistory.create, {
                  organizationId: orgId as Id<"organizations">,
                  retellAgentId: agent.retellAgentId,
                  retellCallId: registration.call_id,
                  direction: "inbound",
                  status: "registered",
                  fromNumber: from,
                  toNumber: "",
                }).catch((err) => console.error("Failed to log AI fallback call:", err));
              }
            } else {
              // AI agent not active — fall back to voicemail
              twiml.say({ voice: "alice" }, voicemailGreeting);
              twiml.record({ timeout: 3, transcribe: true, maxLength: 120, transcribeCallback: `${appUrl}/api/twilio/transcription` });
              twiml.say({ voice: "alice" }, "Thank you for your message. Goodbye.");
              twiml.hangup();
            }
          } catch (err) {
            console.error("[AI FALLBACK] Failed, falling back to voicemail:", err);
            twiml.say({ voice: "alice" }, voicemailGreeting);
            twiml.record({ timeout: 3, transcribe: true, maxLength: 120, transcribeCallback: `${appUrl}/api/twilio/transcription` });
            twiml.say({ voice: "alice" }, "Thank you for your message. Goodbye.");
            twiml.hangup();
          }

          await convex.mutation(api.calls.updateStatusFromWebhook, {
            twilioCallSid: callSid,
            state: "ended",
            outcome: "missed",
          }).catch(() => {});

        } else {
          // ── VOICEMAIL (default) ──
          twiml.say({ voice: "alice" }, voicemailGreeting);
          twiml.record({
            timeout: 3,
            transcribe: true,
            maxLength: 120,
            transcribeCallback: `${appUrl}/api/twilio/transcription`,
          });
          twiml.say({ voice: "alice" }, "Thank you for your message. Goodbye.");
          twiml.hangup();

          await convex.mutation(api.calls.updateStatusFromWebhook, {
            twilioCallSid: callSid,
            state: "ended",
            outcome: dialCallStatus === "no-answer" ? "missed" : dialCallStatus as any,
          });
        }
        break;
      }

      case "canceled":
        // Caller hung up before agent answered
        console.log("Call canceled - caller hung up");
        await convex.mutation(api.calls.updateStatusFromWebhook, {
          twilioCallSid: callSid,
          state: "ended",
          outcome: "cancelled",
        });
        break;

      default:
        console.log(`Unknown dial status: ${dialCallStatus}`);
    }

    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[${errorId}] Dial status webhook error:`, {
      callSid,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });

    // Return empty TwiML on error
    const twiml = new VoiceResponse();
    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}
