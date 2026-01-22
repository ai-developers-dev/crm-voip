import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

// Default hold music from Twilio's free collection
const DEFAULT_HOLD_MUSIC = "http://com.twilio.sounds.music.s3.amazonaws.com/ClockworkWaltz.mp3";

function createTwiML(audioUrl: string): string {
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
  console.log("🎵 hold-music GET called");

  try {
    const url = new URL(request.url);
    const clerkOrgId = url.searchParams.get("clerkOrgId");
    console.log(`🎵 clerkOrgId: ${clerkOrgId}`);

    let audioUrl = DEFAULT_HOLD_MUSIC;

    if (clerkOrgId) {
      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      if (convexUrl) {
        try {
          const convex = new ConvexHttpClient(convexUrl);
          const customUrl = await convex.query(api.holdMusic.getHoldMusicByClerkId, {
            clerkOrgId,
          });
          if (customUrl) {
            audioUrl = customUrl;
            console.log(`🎵 Using custom audio`);
          }
        } catch (err) {
          console.error("🎵 Error fetching custom hold music:", err);
        }
      }
    }

    console.log(`🎵 Playing: ${audioUrl.substring(0, 60)}...`);
    return new NextResponse(createTwiML(audioUrl), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (err) {
    console.error("🎵 hold-music error:", err);
    return new NextResponse(createTwiML(DEFAULT_HOLD_MUSIC), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}

export async function POST(request: NextRequest) {
  console.log("🎵 hold-music POST called");
  return GET(request);
}
