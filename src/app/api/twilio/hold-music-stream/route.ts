import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Proxy endpoint that streams hold music from Convex storage.
 * This ensures proper Content-Type headers for Twilio to play the audio.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const clerkOrgId = url.searchParams.get("clerkOrgId");

    if (!clerkOrgId) {
      return new NextResponse("Missing clerkOrgId", { status: 400 });
    }

    // Get the custom hold music URL from Convex
    const storageUrl = await convex.query(api.holdMusic.getHoldMusicByClerkId, {
      clerkOrgId,
    });

    if (!storageUrl) {
      return new NextResponse("No custom hold music found", { status: 404 });
    }

    console.log(`Streaming hold music from: ${storageUrl}`);

    // Fetch the audio file from Convex storage
    const audioResponse = await fetch(storageUrl);

    if (!audioResponse.ok) {
      console.error(`Failed to fetch audio: ${audioResponse.status}`);
      return new NextResponse("Failed to fetch audio", { status: 500 });
    }

    // Get the audio data
    const audioData = await audioResponse.arrayBuffer();

    // Return the audio with proper headers for Twilio
    return new NextResponse(audioData, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioData.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error streaming hold music:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
