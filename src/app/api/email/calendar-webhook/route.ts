import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import crypto from "crypto";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.NYLAS_WEBHOOK_SECRET;
  if (!secret) return false;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  const digest = hmac.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

// Nylas webhook challenge verification
export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get("challenge");
  if (challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ status: "ok" });
}

// Handle calendar webhook events
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    const signature = request.headers.get("x-nylas-signature") || "";
    if (process.env.NYLAS_WEBHOOK_SECRET && !verifyWebhookSignature(rawBody, signature)) {
      console.error("Invalid Nylas calendar webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const { type, data } = payload;

    if (type === "event.created" || type === "event.updated") {
      await handleEventUpsert(data);
    } else if (type === "event.deleted") {
      await handleEventDeleted(data);
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Calendar webhook error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

async function handleEventUpsert(data: Record<string, unknown>) {
  const eventData = data?.object as Record<string, unknown> | undefined;
  if (!eventData) return;

  const nylasEventId = eventData.id as string;
  const grantId = eventData.grant_id as string || (data.grant_id as string);

  if (!nylasEventId || !grantId) {
    console.error("Missing event ID or grant ID in calendar webhook");
    return;
  }

  const emailAccount = await convex.query(api.emailAccounts.getByNylasGrant, {
    nylasGrantId: grantId,
  });
  if (!emailAccount) {
    console.error(`No email account found for grant ${grantId}`);
    return;
  }

  const when = eventData.when as Record<string, unknown> | undefined;
  let startTime: number;
  let endTime: number;
  let isAllDay = false;

  if (when?.start_time) {
    startTime = (when.start_time as number) * 1000;
    endTime = ((when.end_time as number) || (when.start_time as number)) * 1000;
  } else if (when?.start_date) {
    // All-day event
    startTime = new Date(when.start_date as string).getTime();
    endTime = new Date((when.end_date as string) || (when.start_date as string)).getTime();
    isAllDay = true;
  } else if (when?.date) {
    // Single date event
    startTime = new Date(when.date as string).getTime();
    endTime = startTime + 86400000; // +24h
    isAllDay = true;
  } else {
    console.error("Unknown event time format:", when);
    return;
  }

  const attendees = (eventData.participants as Array<{
    email: string;
    name?: string;
    status?: string;
  }> | undefined)?.map((p) => ({
    email: p.email,
    name: p.name,
    status: p.status || "noreply",
  }));

  // Auto-link to contact by attendee email
  let contactId: Id<"contacts"> | undefined;
  if (attendees && attendees.length > 0) {
    const attendeeEmails = attendees
      .map((a) => a.email)
      .filter((e) => e.toLowerCase() !== emailAccount.email.toLowerCase());
    if (attendeeEmails.length > 0) {
      const matched = await convex.query(api.calendarEvents.matchContactByAttendeeEmail, {
        organizationId: emailAccount.organizationId,
        emails: attendeeEmails,
      });
      if (matched) contactId = matched;
    }
  }

  // Extract conference URL from conferencing data
  const conferencing = eventData.conferencing as Record<string, unknown> | undefined;
  const conferenceUrl = (conferencing?.details as Record<string, unknown>)?.url as string | undefined;

  await convex.mutation(api.calendarEvents.upsert, {
    organizationId: emailAccount.organizationId,
    emailAccountId: emailAccount._id,
    nylasEventId,
    nylasCalendarId: eventData.calendar_id as string | undefined,
    title: (eventData.title as string) || "(No Title)",
    description: eventData.description as string | undefined,
    startTime,
    endTime,
    location: eventData.location as string | undefined,
    isAllDay,
    status: (eventData.status as string) || "confirmed",
    busy: eventData.busy as boolean | undefined,
    conferenceUrl,
    attendees,
    recurringEventId: eventData.master_event_id as string | undefined,
    contactId,
    userId: emailAccount.userId || undefined,
  });

  console.log(`Synced calendar event ${nylasEventId} for org ${emailAccount.organizationId}`);
}

async function handleEventDeleted(data: Record<string, unknown>) {
  const eventData = data?.object as Record<string, unknown> | undefined;
  const nylasEventId = eventData?.id as string || (data.id as string);

  if (!nylasEventId) {
    console.error("Missing event ID in delete webhook");
    return;
  }

  await convex.mutation(api.calendarEvents.remove, { nylasEventId });
  console.log(`Deleted calendar event ${nylasEventId}`);
}
