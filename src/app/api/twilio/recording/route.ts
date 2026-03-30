import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { api } from "../../../../../convex/_generated/api";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";


/**
 * Receive recording status callbacks from Twilio.
 *
 * Twilio POSTs: RecordingSid, RecordingUrl, RecordingStatus,
 * RecordingDuration, CallSid, AccountSid
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
      console.error("Invalid Twilio webhook signature for recording callback");
      return new NextResponse("Forbidden", { status: 403 });
    }

    const callSid = params["CallSid"];
    const recordingUrl = params["RecordingUrl"];
    const recordingStatus = params["RecordingStatus"];
    const recordingDuration = parseInt(params["RecordingDuration"] || "0", 10);

    if (recordingStatus !== "completed") {
      console.log(`Recording for call ${callSid} status: ${recordingStatus} - skipping`);
      return new NextResponse("OK", { status: 200 });
    }

    if (!callSid || !recordingUrl) {
      console.error("Missing CallSid or RecordingUrl in recording callback");
      return new NextResponse("Bad Request", { status: 400 });
    }

    await convex.mutation(api.calls.storeRecording, {
      twilioCallSid: callSid,
      recordingUrl,
      recordingDuration,
    });

    console.log(`Recording stored for call ${callSid}: ${recordingUrl}`);

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("Recording callback error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
