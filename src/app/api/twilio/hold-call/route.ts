import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { getOrgTwilioClient } from "@/lib/twilio/client";


/**
 * Put a call on hold using conference-based hold
 *
 * This is used for multi-call scenarios where an agent needs to
 * hold one call while taking/focusing another. Different from parking
 * because the call remains associated with the agent (not in parking lot).
 *
 * Flow:
 * 1. Get the browser SDK call SID
 * 2. Find the parent PSTN call
 * 3. Redirect the PSTN call to a hold conference with hold music
 * 4. The browser SDK call will disconnect but the PSTN call continues
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { twilioCallSid, action } = await request.json();

    if (!twilioCallSid) {
      return NextResponse.json(
        { error: "twilioCallSid is required" },
        { status: 400 }
      );
    }

    if (action !== "hold") {
      return NextResponse.json(
        { error: "action must be 'hold'" },
        { status: 400 }
      );
    }

    // Get Twilio credentials
    let result;
    try {
      result = await getOrgTwilioClient(orgId);
    } catch {
      return NextResponse.json(
        { error: "Twilio credentials not configured" },
        { status: 400 }
      );
    }
    const { client, org } = result;

    // STEP 1: Fetch the browser SDK call to get the parent PSTN call
    let browserCall;
    let pstnCallSid: string;

    try {
      browserCall = await client.calls(twilioCallSid).fetch();
    } catch (twilioError) {
      console.error("Failed to fetch browser call:", twilioError);
      return NextResponse.json(
        { error: "Failed to fetch browser call from Twilio", details: String(twilioError) },
        { status: 500 }
      );
    }

    // For outbound calls, the browser call IS the primary call
    // For inbound calls, we need the parent call
    if (browserCall.parentCallSid) {
      pstnCallSid = browserCall.parentCallSid;
    } else {
      pstnCallSid = twilioCallSid;
    }

    // Verify the call is still active
    let pstnCall;
    try {
      pstnCall = await client.calls(pstnCallSid).fetch();
    } catch (twilioError) {
      console.error("Failed to fetch PSTN call:", twilioError);
      return NextResponse.json(
        { error: "Failed to fetch PSTN call from Twilio", details: String(twilioError) },
        { status: 500 }
      );
    }

    if (pstnCall.status === "completed" || pstnCall.status === "canceled") {
      return NextResponse.json(
        { error: `Call is already ${pstnCall.status}` },
        { status: 400 }
      );
    }

    // STEP 2: Create a unique hold conference name
    const holdConferenceName = `hold-${pstnCallSid}-${userId}-${Date.now()}`;

    // STEP 3: Get hold music URL
    let holdMusicWaitUrl: string;
    let customAudioUrl: string | null = null;

    if (org.settings?.holdMusicStorageId) {
      try {
        customAudioUrl = await convex.query(api.holdMusic.getHoldMusicByClerkId, { clerkOrgId: orgId });
      } catch (err) {
        console.error("Error fetching custom audio:", err);
      }
    }

    if (customAudioUrl) {
      // Play the uploaded file ONCE as an intro (e.g. "Thank you for calling
      // Kover King, please hold") then fall through to Twilio's classical
      // hold music on loop. Previously this was <Play loop="0">customUrl
      // which loops the uploaded clip forever — if the caller uploaded a
      // greeting instead of music, it repeats that greeting every few seconds.
      const twimlContent = `<Response><Play loop="1">${customAudioUrl}</Play><Play loop="0">http://com.twilio.sounds.music.s3.amazonaws.com/ClockworkWaltz.mp3</Play></Response>`;
      holdMusicWaitUrl = `https://twimlets.com/echo?Twiml=${encodeURIComponent(twimlContent)}`;
    } else {
      holdMusicWaitUrl = "https://twimlets.com/holdmusic?Bucket=com.twilio.music.classical";
    }

    // STEP 4: Redirect the PSTN call to a hold conference
    const twiml = `
      <Response>
        <Dial>
          <Conference
            waitUrl="${holdMusicWaitUrl}"
            waitMethod="GET"
            startConferenceOnEnter="true"
            endConferenceOnExit="false"
          >${holdConferenceName}</Conference>
        </Dial>
      </Response>
    `.trim();

    try {
      await client.calls(pstnCallSid).update({ twiml });
    } catch (updateError) {
      console.error("Failed to redirect call to hold:", updateError);
      return NextResponse.json(
        { error: "Failed to redirect call to hold conference", details: String(updateError) },
        { status: 500 }
      );
    }

    // STEP 5: Update the call state in Convex (mark as on_hold)
    try {
      await convex.mutation(api.calls.updateStatusFromWebhook, {
        twilioCallSid: twilioCallSid,
        state: "on_hold",
      });
    } catch (convexError) {
      console.error("Failed to update call state in Convex:", convexError);
      // Don't fail the request - the Twilio part succeeded
    }

    return NextResponse.json({
      success: true,
      message: "Call placed on hold",
      pstnCallSid,
      conferenceName: holdConferenceName,
    });
  } catch (error) {
    console.error("[hold-call] Error:", error);
    return NextResponse.json(
      { error: "Failed to hold call", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
