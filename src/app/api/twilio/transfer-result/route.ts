import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import twilio from "twilio";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => { params[key] = value.toString(); });

    const isValid = await validateTwilioWebhook(request, params, convex);
    if (!isValid) return new NextResponse("Forbidden", { status: 403 });

    const transferId = request.nextUrl.searchParams.get("transferId");
    const dialCallStatus = params["DialCallStatus"]; // completed, no-answer, busy, failed, canceled

    const twiml = new VoiceResponse();

    if (!transferId) {
      twiml.say("Transfer failed.");
      twiml.hangup();
      return twimlResponse(twiml);
    }

    console.log(`Transfer result: ${transferId} status: ${dialCallStatus}`);

    if (dialCallStatus === "completed") {
      // Target answered and call ended normally - nothing to do, call is done
      twiml.hangup();
    } else {
      // Target didn't answer (no-answer, busy, failed, canceled)
      // Expire the transfer and return caller to hold/source
      try {
        await convex.mutation(api.pendingTransfers.decline, {
          transferId: transferId as Id<"pendingTransfers">,
        });
      } catch (err) {
        console.error("Failed to decline transfer:", err);
      }
      // Say something to the caller
      twiml.say({ voice: "alice" }, "The agent is unavailable. Please hold.");
      twiml.pause({ length: 1 });
    }

    return twimlResponse(twiml);
  } catch (error) {
    console.error("Transfer result error:", error);
    const twiml = new VoiceResponse();
    twiml.say("An error occurred.");
    twiml.hangup();
    return twimlResponse(twiml);
  }
}

function twimlResponse(twiml: any) {
  return new NextResponse(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
