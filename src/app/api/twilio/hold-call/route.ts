import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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

    console.log(`⏸️ HOLD CALL - Starting hold flow for ${twilioCallSid}`);

    // Get Twilio credentials
    const org = await convex.query(api.organizations.getCurrent, { clerkOrgId: orgId });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const twilioCredentials = org.settings?.twilioCredentials;
    let accountSid: string;
    let authToken: string;

    if (twilioCredentials?.isConfigured && twilioCredentials.accountSid && twilioCredentials.authToken) {
      accountSid = twilioCredentials.accountSid;
      authToken = twilioCredentials.authToken;
    } else {
      accountSid = process.env.TWILIO_ACCOUNT_SID || "";
      authToken = process.env.TWILIO_AUTH_TOKEN || "";
    }

    if (!accountSid || !authToken) {
      return NextResponse.json(
        { error: "Twilio credentials not configured" },
        { status: 400 }
      );
    }

    const client = twilio(accountSid, authToken);

    // STEP 1: Fetch the browser SDK call to get the parent PSTN call
    let browserCall;
    let pstnCallSid: string;

    try {
      browserCall = await client.calls(twilioCallSid).fetch();
      console.log(`Browser call details:`, {
        sid: browserCall.sid,
        parentCallSid: browserCall.parentCallSid,
        direction: browserCall.direction,
        status: browserCall.status,
      });
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
      console.log(`Using parent PSTN call: ${pstnCallSid}`);
    } else {
      pstnCallSid = twilioCallSid;
      console.log(`No parent call - using browser call SID as PSTN: ${pstnCallSid}`);
    }

    // Verify the call is still active
    let pstnCall;
    try {
      pstnCall = await client.calls(pstnCallSid).fetch();
      console.log(`PSTN call status: ${pstnCall.status}`);
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
      const twimlContent = `<Response><Play loop="0">${customAudioUrl}</Play></Response>`;
      holdMusicWaitUrl = `https://twimlets.com/echo?Twiml=${encodeURIComponent(twimlContent)}`;
      console.log(`Using custom hold music`);
    } else {
      holdMusicWaitUrl = "https://twimlets.com/holdmusic?Bucket=com.twilio.music.classical";
      console.log(`Using default hold music`);
    }

    // STEP 4: Redirect the PSTN call to a hold conference
    const twiml = `
      <Response>
        <Dial>
          <Conference
            waitUrl="${holdMusicWaitUrl}"
            waitMethod="GET"
            startConferenceOnEnter="false"
            endConferenceOnExit="false"
          >${holdConferenceName}</Conference>
        </Dial>
      </Response>
    `.trim();

    try {
      await client.calls(pstnCallSid).update({ twiml });
      console.log(`✅ Call ${pstnCallSid} placed on hold in conference: ${holdConferenceName}`);
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
    console.error("❌ Error holding call:", error);
    return NextResponse.json(
      { error: "Failed to hold call", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
