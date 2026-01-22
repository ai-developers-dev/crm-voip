import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Simple TwiML endpoint for parking lot hold music.
 * Returns TwiML that plays the org's custom hold music or default.
 *
 * This endpoint is called by Twilio as the conference waitUrl.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const clerkOrgId = url.searchParams.get("clerkOrgId");

  console.log(`🎵 park-music called for org: ${clerkOrgId}`);

  // Default Twilio hold music
  let audioUrl = "http://com.twilio.sounds.music.s3.amazonaws.com/ClockworkWaltz.mp3";

  if (clerkOrgId) {
    try {
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
}

// Also handle POST for flexibility
export async function POST(request: NextRequest) {
  return GET(request);
}
