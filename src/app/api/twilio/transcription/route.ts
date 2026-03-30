import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { api } from "../../../../../convex/_generated/api";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";


/**
 * Receive voicemail transcription results from Twilio.
 *
 * Twilio POSTs: TranscriptionSid, TranscriptionText, TranscriptionStatus,
 * RecordingSid, RecordingUrl, CallSid, AccountSid, From, To
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
      console.error("Invalid Twilio webhook signature for transcription callback");
      return new NextResponse("Forbidden", { status: 403 });
    }

    const callSid = params["CallSid"];
    const transcriptionSid = params["TranscriptionSid"];
    const transcriptionText = params["TranscriptionText"] || "";
    const transcriptionStatus = params["TranscriptionStatus"];

    if (transcriptionStatus !== "completed") {
      console.log(`Transcription ${transcriptionSid} status: ${transcriptionStatus} - skipping`);
      return new NextResponse("OK", { status: 200 });
    }

    if (!callSid || !transcriptionSid) {
      console.error("Missing CallSid or TranscriptionSid in transcription callback");
      return new NextResponse("Bad Request", { status: 400 });
    }

    await convex.mutation(api.calls.storeTranscription, {
      twilioCallSid: callSid,
      transcriptionSid,
      transcriptionText,
    });

    console.log(`Transcription stored for call ${callSid}: ${transcriptionText.slice(0, 100)}...`);

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("Transcription callback error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
