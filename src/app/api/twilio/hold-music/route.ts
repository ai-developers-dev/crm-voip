import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * TwiML endpoint that plays hold music on loop
 *
 * This is called when a call is redirected to hold (parked).
 * The caller hears royalty-free hold music until the call is resumed.
 */
export async function POST(request: NextRequest) {
  try {
    const twiml = new VoiceResponse();

    // Play hold music on infinite loop
    // Using Twilio's built-in royalty-free hold music
    // You can replace this URL with your own hold music file
    twiml.play({
      loop: 0, // 0 = infinite loop
    }, "http://com.twilio.sounds.music.s3.amazonaws.com/ClockworkWaltz.mp3");

    // Alternative hold music options (uncomment to use):
    // twiml.play({ loop: 0 }, "http://com.twilio.sounds.music.s3.amazonaws.com/BusyStrings.mp3");
    // twiml.play({ loop: 0 }, "http://com.twilio.sounds.music.s3.amazonaws.com/VersijOntw);
    // twiml.play({ loop: 0 }, "http://com.twilio.sounds.music.s3.amazonaws.com/oldDog_-_endless_summer.mp3");

    const twimlString = twiml.toString();
    console.log("Returning hold music TwiML:", twimlString);

    return new NextResponse(twimlString, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Error generating hold music TwiML:", error);

    // Return silent pause as fallback
    const twiml = new VoiceResponse();
    twiml.pause({ length: 60 });

    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}

// Also handle GET for testing
export async function GET() {
  const twiml = new VoiceResponse();
  twiml.play({
    loop: 0,
  }, "http://com.twilio.sounds.music.s3.amazonaws.com/ClockworkWaltz.mp3");

  return new NextResponse(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
