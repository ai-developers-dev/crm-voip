import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import twilio from "twilio";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * TwiML returned to the TARGET agent's leg when they answer the
 * transfer-ring outbound call. Drops them into the transfer conference
 * created by `/api/twilio/transfer` so they're connected to the caller
 * (and to the source agent in warm mode).
 *
 * Previously this route returned an empty `<Dial action="…"/>` with no
 * target — the entire transfer flow has been broken since whoever
 * wrote it. Now we look up the conferenceName off the pendingTransfer
 * row and `<Dial><Conference>…` it.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });
    const isValid = await validateTwilioWebhook(request, params, convex);
    if (!isValid) {
      console.error("[transfer-ring] Invalid Twilio webhook signature");
      const twiml = new VoiceResponse();
      twiml.say(
        { voice: "alice" },
        "This transfer is temporarily unavailable.",
      );
      twiml.hangup();
      return new NextResponse(twiml.toString(), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    const transferId = request.nextUrl.searchParams.get("transferId");
    if (!transferId) {
      console.error("[transfer-ring] no transferId");
      const twiml = new VoiceResponse();
      twiml.say({ voice: "alice" }, "Transfer failed. Please try again.");
      twiml.hangup();
      return new NextResponse(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Look up the conferenceName off the pendingTransfer row. The row
    // is the source of truth — passing the name as a query param would
    // be cheaper but spoofable; the webhook-signature check above
    // already proves Twilio sent us this request, but the conferenceName
    // is also security-sensitive (anyone in it can hear the caller).
    let conferenceName: string | null = null;
    try {
      const transfer = await convex.query(api.pendingTransfers.getById, {
        transferId: transferId as Id<"pendingTransfers">,
      });
      conferenceName = transfer?.conferenceName ?? null;
    } catch (lookupErr) {
      console.error(
        `[transfer-ring] failed to look up transfer ${transferId}:`,
        lookupErr,
      );
    }

    if (!conferenceName) {
      console.error(
        `[transfer-ring] transfer ${transferId} has no conferenceName`,
      );
      const twiml = new VoiceResponse();
      twiml.say(
        { voice: "alice" },
        "This transfer can't be completed. Please try again.",
      );
      twiml.hangup();
      return new NextResponse(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    const twiml = new VoiceResponse();
    twiml.say({ voice: "alice" }, "Incoming transfer. Please hold.");
    const dial = twiml.dial({
      // Fires when the target's <Dial> ends (everyone left the
      // conference, or target hung up before joining). transfer-result
      // marks the pendingTransfer terminal and, for cold transfers,
      // redirects the caller back to the source agent if needed.
      action: `${appUrl}/api/twilio/transfer-result?transferId=${transferId}`,
    });
    dial.conference(
      {
        startConferenceOnEnter: true,
        endConferenceOnExit: false,
      },
      conferenceName,
    );

    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("[transfer-ring] error:", error);
    const twiml = new VoiceResponse();
    twiml.say(
      { voice: "alice" },
      "There was an error completing the transfer.",
    );
    twiml.hangup();
    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
