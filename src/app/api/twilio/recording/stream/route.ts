import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getConvexHttpClient } from "@/lib/convex/client";
import { getOrgTwilioClient } from "@/lib/twilio/client";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";

/**
 * Stream a Twilio recording through the app with Basic auth.
 *
 * Twilio recording URLs (`https://api.twilio.com/.../Recordings/RExxx`) require:
 *   1. Basic auth with the owning account's SID + auth token
 *   2. An explicit `.mp3` suffix for audio bytes (otherwise the endpoint returns JSON)
 *
 * Browser `<audio>` can't send auth headers, so without a proxy the play
 * button silently fails. This route verifies the caller is a member of the
 * recording's org, then fetches with credentials and pipes the audio back.
 */
export async function GET(request: NextRequest) {
  const { userId, orgId, getToken } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const callHistoryId = request.nextUrl.searchParams.get("callId");
  if (!callHistoryId) {
    return NextResponse.json({ error: "callId required" }, { status: 400 });
  }

  const convexJwt = await getToken({ template: "convex" });
  const convex = getConvexHttpClient(convexJwt);

  const recording = await convex.query(api.calls.getRecording, {
    callHistoryId: callHistoryId as Id<"callHistory">,
  });
  if (!recording) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Twilio recording URLs look like:
  //   https://api.twilio.com/2010-04-01/Accounts/ACxxx/Recordings/RExxx
  // The AccountSid in the URL may be a subaccount — we must authenticate
  // with that subaccount's creds (not the master). getOrgTwilioClient already
  // returns subaccount creds when the org has per-tenant Twilio configured.
  const { accountSid, authToken } = await getOrgTwilioClient(orgId);

  const mp3Url = recording.recordingUrl.endsWith(".mp3")
    ? recording.recordingUrl
    : `${recording.recordingUrl}.mp3`;

  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  console.log(`[recording-stream] fetching ${mp3Url} for callId=${callHistoryId}`);

  const twilioRes = await fetch(mp3Url, {
    headers: { Authorization: `Basic ${basicAuth}` },
  });

  if (!twilioRes.ok) {
    const body = await twilioRes.text().catch(() => "");
    console.error(
      `[recording-stream] Twilio ${twilioRes.status} for ${mp3Url}: ${body.slice(0, 200)}`
    );
    return NextResponse.json(
      { error: "Failed to fetch recording", twilioStatus: twilioRes.status },
      { status: 502 }
    );
  }

  // Buffer the audio so we can send a correct Content-Length. The browser's
  // <audio controls> shows 0:00/0:00 if it can't determine total duration,
  // which happens when Content-Length is missing and the stream arrives in
  // chunks. For typical call recordings (<5MB) this is fine.
  const audioBuffer = Buffer.from(await twilioRes.arrayBuffer());
  console.log(
    `[recording-stream] delivered ${audioBuffer.length} bytes to callId=${callHistoryId}`
  );

  return new NextResponse(audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audioBuffer.length),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
