import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { api } from "../../../../../convex/_generated/api";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";

// Default hold music — switched from twimlets.com (third-party,
// undocumented SLA) to Twilio's hosted demo asset. https-served and
// stable. Same URL we use for the conference waitUrl in transfer.
const DEFAULT_HOLD_MUSIC = "https://demo.twilio.com/docs/classic.mp3";

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
 * TwiML endpoint that plays hold music on loop. Called by Twilio as
 * the conference waitUrl (GET by default).
 *
 * Signature validation is required because anyone hitting this URL
 * could otherwise probe per-tenant custom audio URLs by guessing
 * `clerkOrgId` query params. For GET, Twilio expects validateRequest
 * to receive empty params — AccountSid lives in the URL query.
 */
export async function GET(request: NextRequest) {
  try {
    const isValid = await validateTwilioWebhook(request, {}, convex);
    if (!isValid) {
      console.error("[hold-music] Invalid Twilio webhook signature");
      // Return generic Twilio default so the caller still gets music
      // rather than dead air, but don't reveal any per-tenant config.
      return new NextResponse(createTwiML(DEFAULT_HOLD_MUSIC, false), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

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

// POST falls through to the same handler for the rare case Twilio
// is configured to use POST. Validation will read AccountSid from the
// form body since `params` is unused on this route either way.
export async function POST(request: NextRequest) {
  return GET(request);
}
