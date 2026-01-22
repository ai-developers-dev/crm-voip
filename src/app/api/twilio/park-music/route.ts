import { NextRequest, NextResponse } from "next/server";

// Default Twilio hold music
const DEFAULT_MUSIC = "http://com.twilio.sounds.music.s3.amazonaws.com/ClockworkWaltz.mp3";

/**
 * Simple TwiML endpoint for parking lot hold music.
 * This endpoint is called by Twilio as the conference waitUrl.
 */
export async function GET(request: NextRequest) {
  console.log("🎵 park-music GET called");

  // For now, just return default music to verify the endpoint works
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

export async function POST(request: NextRequest) {
  console.log("🎵 park-music POST called");
  return GET(request);
}
