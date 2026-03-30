import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import Nylas from "nylas";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY!,
  apiUri: process.env.NYLAS_API_URI || "https://api.us.nylas.com",
});


// One-time calendar backfill when a user connects their account
export async function POST(request: NextRequest) {
  try {
    const { emailAccountId, grantId, organizationId } = await request.json();

    if (!grantId || !organizationId || !emailAccountId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const emailAccount = await convex.query(api.emailAccounts.getByNylasGrant, {
      nylasGrantId: grantId,
    });
    if (!emailAccount) {
      return NextResponse.json(
        { success: false, error: "Email account not found" },
        { status: 404 }
      );
    }

    // Fetch recent and upcoming events (past 30 days + next 90 days)
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 86400;
    const ninetyDaysAhead = now + 90 * 86400;

    let synced = 0;
    let pageToken: string | undefined;

    do {
      const response = await nylas.events.list({
        identifier: grantId,
        queryParams: {
          calendarId: "primary",
          start: thirtyDaysAgo.toString(),
          end: ninetyDaysAhead.toString(),
          limit: 200,
          ...(pageToken ? { pageToken } : {}),
        },
      });

      const events = response.data;
      pageToken = response.nextCursor ?? undefined;

      for (const event of events) {
        const when = event.when as unknown as Record<string, unknown>;
        let startTime: number;
        let endTime: number;
        let isAllDay = false;

        if ("startTime" in when) {
          startTime = (when.startTime as number) * 1000;
          endTime = ((when.endTime as number) || (when.startTime as number)) * 1000;
        } else if ("startDate" in when) {
          startTime = new Date(when.startDate as string).getTime();
          endTime = new Date((when.endDate as string) || (when.startDate as string)).getTime();
          isAllDay = true;
        } else if ("date" in when) {
          startTime = new Date(when.date as string).getTime();
          endTime = startTime + 86400000;
          isAllDay = true;
        } else {
          continue;
        }

        const attendees = event.participants
          ?.filter((p): p is typeof p & { email: string } => !!p.email)
          .map((p) => ({
            email: p.email,
            name: p.name ?? undefined,
            status: (p.status as string) || "noreply",
          }));

        // Auto-link contact
        let contactId: Id<"contacts"> | undefined;
        if (attendees && attendees.length > 0) {
          const attendeeEmails = attendees
            .map((a) => a.email)
            .filter((e): e is string => !!e && e.toLowerCase() !== emailAccount.email.toLowerCase());
          if (attendeeEmails.length > 0) {
            const matched = await convex.query(api.calendarEvents.matchContactByAttendeeEmail, {
              organizationId: emailAccount.organizationId as Id<"organizations">,
              emails: attendeeEmails,
            });
            if (matched) contactId = matched;
          }
        }

        const conferencing = event.conferencing as Record<string, unknown> | undefined;
        const conferenceUrl = (conferencing?.details as Record<string, unknown>)?.url as string | undefined;

        await convex.mutation(api.calendarEvents.upsert, {
          organizationId: emailAccount.organizationId as Id<"organizations">,
          emailAccountId: emailAccount._id,
          nylasEventId: event.id,
          nylasCalendarId: event.calendarId,
          title: event.title || "(No Title)",
          description: event.description ?? undefined,
          startTime,
          endTime,
          location: event.location ?? undefined,
          isAllDay,
          status: event.status || "confirmed",
          busy: event.busy !== undefined ? event.busy : undefined,
          conferenceUrl,
          attendees,
          recurringEventId: event.masterEventId ?? undefined,
          contactId,
          userId: emailAccount.userId || undefined,
        });

        synced++;
      }
    } while (pageToken);

    return NextResponse.json({ success: true, synced });
  } catch (error) {
    console.error("Calendar sync error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
