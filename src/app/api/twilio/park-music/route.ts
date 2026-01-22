import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

// Default Twilio hold music
const DEFAULT_MUSIC = "http://com.twilio.sounds.music.s3.amazonaws.com/ClockworkWaltz.mp3";

/**
 * Simple TwiML endpoint for parking lot hold music.
 * Returns TwiML that plays the org's custom hold music or default.
 *
 * This endpoint is called by Twilio as the conference waitUrl.
 */
export async function GET(request: NextRequest) {
  console.log(`🎵 park-music GET called`);

  try {
    const url = new URL(request.url);
    const clerkOrgId = url.searchParams.get("clerkOrgId");

    console.log(`🎵 park-music called for org: ${clerkOrgId}`);

    let audioUrl = DEFAULT_MUSIC;

    // Only try Convex if we have the URL configured
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    console.log(`🎵 CONVEX_URL configured: ${convexUrl ? 'yes' : 'NO'}`);

    if (clerkOrgId && convexUrl) {
      try {
        const convex = new ConvexHttpClient(convexUrl);
        const customUrl = await convex.query(api.holdMusic.getHoldMusicByClerkId, {
          clerkOrgId,
        });

        console.log(`🎵 Custom URL from Convex: ${customUrl || 'none'}`);

        if (customUrl) {
          audioUrl = customUrl;
        }
      } catch (err) {
        console.error(`🎵 Error fetching custom hold music:`, err);
      }
    }

    console.log(`🎵 Playing: ${audioUrl}`);

    // Return simple TwiML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="0">${audioUrl}</Play>
</Response>`;

    return new NextResponse(twiml, {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } catch (err) {
    console.error(`🎵 park-music error:`, err);

    // Return default music on any error
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="0">${DEFAULT_MUSIC}</Play>
</Response>`;

    return new NextResponse(twiml, {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  }
}

// Also handle POST for flexibility
export async function POST(request: NextRequest) {
  console.log(`🎵 park-music POST called`);
  return GET(request);
}
