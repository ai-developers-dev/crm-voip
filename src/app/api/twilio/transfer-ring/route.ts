import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const VoiceResponse = twilio.twiml.VoiceResponse;
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * TwiML endpoint for the transfer ringing call
 *
 * When the target agent answers via their Twilio SDK, this TwiML tells
 * Twilio to connect (bridge) with the original held call.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const transferId = searchParams.get("transferId");

    if (!transferId) {
      console.error("No transferId provided");
      const twiml = new VoiceResponse();
      twiml.say("Transfer failed. Please try again.");
      twiml.hangup();
      return new NextResponse(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Get transfer details from Convex
    const transfer = await convex.query(api.pendingTransfers.getByTwilioSid, {
      twilioCallSid: transferId,
    });

    console.log(`Transfer ring TwiML for: ${transferId}`);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const twiml = new VoiceResponse();

    // Short ring indication before connecting
    twiml.say({ voice: "alice" }, "Incoming transfer.");

    // The actual connection happens when the agent answers via SDK
    // This TwiML just plays while the call connects
    twiml.dial({
      action: `${appUrl}/api/twilio/transfer-result?transferId=${transferId}`,
      timeout: 30,
    });

    const twimlString = twiml.toString();
    console.log("Transfer ring TwiML:", twimlString);

    return new NextResponse(twimlString, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Error in transfer-ring:", error);

    const twiml = new VoiceResponse();
    twiml.say("There was an error with the transfer.");
    twiml.hangup();

    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
