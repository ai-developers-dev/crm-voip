import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { getOrgTwilioClient } from "@/lib/twilio/client";


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

    // Park the call via conference-based parking

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

    // STEP 1: Fetch the browser SDK call to get the parent call SID
    let browserCall;
    let pstnCallSid: string;
    let parentCall;

    try {
      browserCall = await client.calls(twilioCallSid).fetch();
    } catch (twilioError) {
      console.error("Could not fetch browser call:", twilioError);
      return NextResponse.json(
        { error: "Failed to fetch browser call from Twilio", details: String(twilioError) },
        { status: 500 }
      );
    }

    if (!browserCall.parentCallSid) {
      return NextResponse.json(
        { error: "No parent call found - cannot park this call" },
        { status: 400 }
      );
    }

    pstnCallSid = browserCall.parentCallSid;

    // Verify parent call is still active
    try {
      parentCall = await client.calls(pstnCallSid).fetch();
    } catch (twilioError) {
      console.error("Could not fetch parent call:", twilioError);
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
      const convexOrgId = organizationId || org._id;

      parkResult = await convex.mutation(api.calls.parkByCallSid, {
        twilioCallSid: twilioCallSid,
        pstnCallSid: pstnCallSid, // Store the PSTN call SID for unparking
        conferenceName,
        callerNumber: callerNumber || parentCall.from || "Unknown",
        callerName: callerName,
        organizationId: convexOrgId as Id<"organizations">,
        parkedByUserId: parkedByUserId as Id<"users"> | undefined,
      });

    } catch (convexError) {
      console.error("Failed to save parking record:", convexError);
      return NextResponse.json(
        { error: "Failed to save to database", details: String(convexError) },
        { status: 500 }
      );
    }

    // STEP 3: NOW redirect the PSTN call to conference
    try {

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

      const statusCallbackUrl = `${baseUrl}/api/twilio/parking-status?conference=${encodeURIComponent(conferenceName)}`;

      // Get hold music URL - fetch fresh URL if we have a storage ID
      let holdMusicWaitUrl: string;

      // Try to get custom hold music from Convex
      let customAudioUrl: string | null = null;

      if (org.settings?.holdMusicStorageId) {
        try {
          customAudioUrl = await convex.query(api.holdMusic.getHoldMusicByClerkId, { clerkOrgId: orgId });
        } catch (err) {
          console.error("Error fetching custom hold music:", err);
        }
      }

      if (customAudioUrl) {
        const twimlContent = `<Response><Play loop="0">${customAudioUrl}</Play></Response>`;
        holdMusicWaitUrl = `https://twimlets.com/echo?Twiml=${encodeURIComponent(twimlContent)}`;
      } else {
        holdMusicWaitUrl = "https://twimlets.com/holdmusic?Bucket=com.twilio.music.classical";
      }

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

      await client.calls(pstnCallSid).update({
        twiml: twiml,
      });
    } catch (twilioError) {
      console.error("Could not redirect call to conference:", twilioError);
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
    console.error("Error parking call:", error);
    return NextResponse.json(
      { error: "Failed to park call", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
