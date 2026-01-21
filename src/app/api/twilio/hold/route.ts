import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Park a call using conference-based parking
 *
 * Flow (same as working app):
 * 1. Get parent call SID (PSTN caller)
 * 2. Save to database FIRST (ensures UI updates immediately)
 * 3. THEN redirect the call to conference
 *
 * This ensures the parking lot entry exists before any status callbacks arrive.
 * Updated: 2026-01-14 - Convex functions deployed
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { twilioCallSid, callerNumber, callerName, organizationId, parkedByUserId } = await request.json();

    if (!twilioCallSid) {
      return NextResponse.json(
        { error: "twilioCallSid is required" },
        { status: 400 }
      );
    }

    console.log(`🚗 PARKING CALL - Starting park flow for ${twilioCallSid}`);

    // Get Twilio credentials (check org settings first, then env vars)
    const org = await convex.query(api.organizations.getCurrent, { clerkOrgId: orgId });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Get Twilio credentials
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

    // Create Twilio REST client
    const client = twilio(accountSid, authToken);

    // STEP 1: Fetch the browser SDK call to get the parent call SID
    let browserCall;
    let pstnCallSid: string;
    let parentCall;

    try {
      console.log(`Step 1: Fetching browser client call: ${twilioCallSid}`);
      browserCall = await client.calls(twilioCallSid).fetch();
      console.log(`Browser call details:`, {
        sid: browserCall.sid,
        parentCallSid: browserCall.parentCallSid,
        direction: browserCall.direction,
        status: browserCall.status,
      });
    } catch (twilioError) {
      console.error("Step 1 FAILED - Could not fetch browser call:", twilioError);
      return NextResponse.json(
        { error: "Failed to fetch browser call from Twilio", details: String(twilioError) },
        { status: 500 }
      );
    }

    if (!browserCall.parentCallSid) {
      console.error("No parent call found - this may not be a browser client call");
      return NextResponse.json(
        { error: "No parent call found - cannot park this call" },
        { status: 400 }
      );
    }

    pstnCallSid = browserCall.parentCallSid;
    console.log(`PSTN parent call SID: ${pstnCallSid}`);

    // Verify parent call is still active
    try {
      parentCall = await client.calls(pstnCallSid).fetch();
      console.log(`Parent call status: ${parentCall.status}`);
    } catch (twilioError) {
      console.error("Step 1b FAILED - Could not fetch parent call:", twilioError);
      return NextResponse.json(
        { error: "Failed to fetch parent call from Twilio", details: String(twilioError) },
        { status: 500 }
      );
    }

    if (parentCall.status === "completed" || parentCall.status === "canceled") {
      return NextResponse.json(
        { error: `Parent call is already ${parentCall.status}` },
        { status: 400 }
      );
    }

    // Create unique conference name
    const conferenceName = `park-${pstnCallSid}-${Date.now()}`;

    // STEP 2: Save to database FIRST (like working app)
    let parkResult;
    try {
      console.log(`Step 2: Saving to database FIRST...`);
      console.log(`  organizationId from request: ${organizationId}`);
      console.log(`  org._id from query: ${org._id}`);
      console.log(`  parkedByUserId: ${parkedByUserId}`);

      const convexOrgId = organizationId || org._id;
      console.log(`  Using convexOrgId: ${convexOrgId}`);

      parkResult = await convex.mutation(api.calls.parkByCallSid, {
        twilioCallSid: twilioCallSid,
        pstnCallSid: pstnCallSid, // Store the PSTN call SID for unparking
        conferenceName,
        callerNumber: callerNumber || parentCall.from || "Unknown",
        callerName: callerName,
        organizationId: convexOrgId as Id<"organizations">,
        parkedByUserId: parkedByUserId as Id<"users"> | undefined,
      });

      console.log(`✅ Database updated - slot ${parkResult.slotNumber}`, parkResult);
    } catch (convexError) {
      console.error("Step 2 FAILED - Convex mutation error:", convexError);
      return NextResponse.json(
        { error: "Failed to save to database", details: String(convexError) },
        { status: 500 }
      );
    }

    // STEP 3: NOW redirect the PSTN call to conference
    try {
      console.log(`Step 3: Redirecting PSTN call ${pstnCallSid} to conference: ${conferenceName}`);

      // Get the base URL for callbacks - must be publicly accessible (not localhost)
      // Priority: NEXT_PUBLIC_APP_URL (if production), then derive from request headers
      let baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

      // If NEXT_PUBLIC_APP_URL is localhost, try to use request headers instead
      if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
        const host = request.headers.get("host");
        const proto = request.headers.get("x-forwarded-proto") || "https";
        if (host && !host.includes("localhost")) {
          baseUrl = `${proto}://${host}`;
        }
      }

      // Fallback: derive from request URL if still localhost
      if (baseUrl.includes("localhost") || !baseUrl) {
        const requestUrl = new URL(request.url);
        if (!requestUrl.host.includes("localhost")) {
          baseUrl = requestUrl.origin;
        }
      }

      console.log(`Using baseUrl: ${baseUrl}`);
      const statusCallbackUrl = `${baseUrl}/api/twilio/parking-status?conference=${encodeURIComponent(conferenceName)}`;

      // Get hold music URL - fetch fresh URL if we have a storage ID
      let holdMusicWaitUrl: string;

      console.log(`🎵 Hold music check - storageId: ${org.settings?.holdMusicStorageId || 'none'}`);

      // TEMPORARY TEST: Force using default twimlet to verify conference waitUrl works at all
      // If caller hears music with this, then the issue is with our custom audio URL
      holdMusicWaitUrl = "https://twimlets.com/holdmusic?Bucket=com.twilio.music.classical";
      console.log(`🎵 FORCED TEST: Using default Twilio hold music twimlet`);

      /* DISABLED FOR TESTING
      if (org.settings?.holdMusicStorageId) {
        const freshAudioUrl = await convex.query(api.holdMusic.getHoldMusicByClerkId, {
          clerkOrgId: orgId,
        });
        console.log(`🎵 Fresh audio URL from Convex: ${freshAudioUrl || 'none'}`);
        if (freshAudioUrl) {
          const twimlContent = `<Response><Play loop="0">${freshAudioUrl}</Play></Response>`;
          holdMusicWaitUrl = `https://twimlets.com/echo?Twiml=${encodeURIComponent(twimlContent)}`;
          console.log(`🎵 Using custom hold music via Echo twimlet`);
        }
      }
      */

      // IMPORTANT: startConferenceOnEnter="false" means the caller hears waitUrl music
      // while waiting alone. The conference "starts" when an agent joins with
      // startConferenceOnEnter="true" (during unpark). Until then, hold music plays.
      const twiml = `
        <Response>
          <Dial>
            <Conference
              waitUrl="${holdMusicWaitUrl}"
              waitMethod="GET"
              startConferenceOnEnter="false"
              endConferenceOnExit="false"
              statusCallback="${statusCallbackUrl}"
              statusCallbackEvent="end leave"
            >${conferenceName}</Conference>
          </Dial>
        </Response>
      `.trim();

      console.log(`🎵 Full TwiML being sent to Twilio:`);
      console.log(twiml);

      await client.calls(pstnCallSid).update({
        twiml: twiml,
      });

      console.log(`✅ Call parked successfully - PSTN ${pstnCallSid} in conference: ${conferenceName}`);
    } catch (twilioError) {
      console.error("Step 3 FAILED - Could not redirect call:", twilioError);
      // Note: DB entry was already created, so call is "parked" in DB but not in Twilio
      return NextResponse.json(
        { error: "Failed to redirect call to conference", details: String(twilioError) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      conferenceName,
      pstnCallSid,
      browserCallSid: twilioCallSid,
      slotNumber: parkResult.slotNumber,
      message: "Call parked in conference with hold music"
    });
  } catch (error) {
    console.error("❌ Error parking call:", error);
    return NextResponse.json(
      { error: "Failed to park call", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
