import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { api } from "../../../../../convex/_generated/api";

// Default hold music from Twilio's free collection
const DEFAULT_HOLD_MUSIC = "http://com.twilio.sounds.music.s3.amazonaws.com/ClockworkWaltz.mp3";

function createTwiML(audioUrl: string, isCustom: boolean): string {
  // If the caller uploaded their own audio, play it ONCE as an intro then
  // fall through to Twilio's classical hold music on loop. Otherwise just
  // loop the default music. Avoids the "Thank you for calling Kover King"
  // greeting playing every few seconds on loop.
  if (isCustom) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="1">${audioUrl}</Play>
  <Play loop="0">${DEFAULT_HOLD_MUSIC}</Play>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="0">${audioUrl}</Play>
</Response>`;
}

/**
 * TwiML endpoint that plays hold music on loop
 * This is called by Twilio as the conference waitUrl.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const clerkOrgId = url.searchParams.get("clerkOrgId");

    let audioUrl = DEFAULT_HOLD_MUSIC;
    let isCustom = false;

    if (clerkOrgId) {
      try {
        const customUrl = await convex.query(api.holdMusic.getHoldMusicByClerkId, {
          clerkOrgId,
        });
        if (customUrl) {
          audioUrl = customUrl;
          isCustom = true;
        }
      } catch (err) {
        console.error("[hold-music] Error fetching custom hold music:", err);
      }
    }

    return new NextResponse(createTwiML(audioUrl, isCustom), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (err) {
    console.error("[hold-music] Error:", err);
    return new NextResponse(createTwiML(DEFAULT_HOLD_MUSIC, false), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
