import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const VoiceResponse = twilio.twiml.VoiceResponse;
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Default hold music from Twilio's free collection
const DEFAULT_HOLD_MUSIC = "http://com.twilio.sounds.music.s3.amazonaws.com/ClockworkWaltz.mp3";

/**
 * TwiML endpoint that plays hold music on loop
 *
 * This is called when a call is redirected to hold (parked).
 * If the organization has custom hold music uploaded, it plays that.
 * Otherwise, it falls back to Twilio's royalty-free hold music.
 */
export async function POST(request: NextRequest) {
  try {
    // Check for organization ID in query params or form data
    const url = new URL(request.url);
    let clerkOrgId = url.searchParams.get("clerkOrgId");

    // Also check form data (for TwiML callbacks)
    if (!clerkOrgId) {
      try {
        const formData = await request.formData();
        clerkOrgId = formData.get("clerkOrgId") as string | null;
      } catch {
        // Form data not available, continue with null
      }
    }

    let holdMusicUrl = DEFAULT_HOLD_MUSIC;

    // If we have an org ID, check for custom hold music
    if (clerkOrgId) {
      try {
        const customUrl = await convex.query(api.holdMusic.getHoldMusicByClerkId, {
          clerkOrgId,
        });
        if (customUrl) {
          holdMusicUrl = customUrl;
          console.log(`Using custom hold music for org ${clerkOrgId}`);
        }
      } catch (err) {
        console.error("Error fetching custom hold music:", err);
        // Continue with default
      }
    }

    const twiml = new VoiceResponse();
    twiml.play({ loop: 0 }, holdMusicUrl);

    const twimlString = twiml.toString();
    console.log("Returning hold music TwiML:", twimlString.substring(0, 200));

    return new NextResponse(twimlString, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Error generating hold music TwiML:", error);

    // Return default music as fallback
    const twiml = new VoiceResponse();
    twiml.play({ loop: 0 }, DEFAULT_HOLD_MUSIC);

    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}

// Handle GET for Twilio conference waitUrl callback
export async function GET(request: NextRequest) {
  console.log("Hold music GET request received");

  try {
    const url = new URL(request.url);
    const clerkOrgId = url.searchParams.get("clerkOrgId");
    console.log(`Hold music request for org: ${clerkOrgId || 'none'}`);

    let holdMusicUrl = DEFAULT_HOLD_MUSIC;

    // Check for custom hold music if org ID provided
    if (clerkOrgId) {
      try {
        const customUrl = await convex.query(api.holdMusic.getHoldMusicByClerkId, {
          clerkOrgId,
        });
        console.log(`Custom URL from Convex: ${customUrl || 'none'}`);
        if (customUrl) {
          // Use our streaming proxy endpoint instead of Convex URL directly
          // This ensures proper Content-Type headers for Twilio
          const baseUrl = url.origin;
          holdMusicUrl = `${baseUrl}/api/twilio/hold-music-stream?clerkOrgId=${encodeURIComponent(clerkOrgId)}`;
          console.log(`Using streaming proxy: ${holdMusicUrl}`);
        }
      } catch (err) {
        console.error("Error fetching custom hold music in GET:", err);
        // Use default
      }
    }

    console.log(`Playing hold music URL: ${holdMusicUrl}`);

    const twiml = new VoiceResponse();
    twiml.play({ loop: 0 }, holdMusicUrl);

    const twimlString = twiml.toString();
    console.log("Returning TwiML:", twimlString);

    return new NextResponse(twimlString, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Error in hold-music GET:", error);

    // Return default music as fallback
    const twiml = new VoiceResponse();
    twiml.play({ loop: 0 }, DEFAULT_HOLD_MUSIC);

    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}
