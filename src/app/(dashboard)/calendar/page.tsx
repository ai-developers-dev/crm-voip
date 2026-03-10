"use client";

import { useMemo, useState, useEffect } from "react";
import { useOrganization, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { CalendarView, type CalendarEvent } from "@/components/calendar/calendar-view";
import { NewAppointmentDialog } from "@/components/calendar/new-appointment-dialog";
import { EditAppointmentDialog } from "@/components/calendar/edit-appointment-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  addMonths,
} from "date-fns";
import { Loader2 } from "lucide-react";

export default function CalendarPage() {
  const { organization } = useOrganization();
  const { user: clerkUser } = useUser();
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [newApptDate, setNewApptDate] = useState<Date | undefined>();
  const [editApptId, setEditApptId] = useState<Id<"appointments"> | null>(null);

  const [viewRange] = useState(() => {
    const now = new Date();
    return {
      start: subMonths(startOfMonth(now), 1).getTime(),
      end: addMonths(endOfMonth(now), 1).getTime(),
    };
  });

  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const convexUser = useQuery(
    api.users.getByClerkId,
    clerkUser?.id && convexOrg?._id
      ? { clerkUserId: clerkUser.id, organizationId: convexOrg._id }
      : "skip"
  );

  const isPlatformAdmin = useQuery(
    api.platformUsers.isPlatformUser,
    clerkUser?.id ? { clerkUserId: clerkUser.id } : "skip"
  );

  const orgUsers = useQuery(
    api.users.getByOrganization,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  // Platform admins or tenant admins/supervisors can see the user dropdown
  const isAdmin = isPlatformAdmin || convexUser?.role === "tenant_admin" || convexUser?.role === "supervisor";

  // Default agents to their own calendar, admins to "all"
  useEffect(() => {
    if (convexUser && selectedUserId === "all" && !isAdmin) {
      setSelectedUserId(convexUser._id);
    }
  }, [convexUser, isAdmin, selectedUserId]);

  const filterByUser = selectedUserId !== "all";
  const filterUserId = filterByUser ? (selectedUserId as Id<"users">) : undefined;

  // Fetch synced calendar events (org-level or user-level)
  const orgCalendarEvents = useQuery(
    api.calendarEvents.getByOrganization,
    !filterByUser && convexOrg?._id
      ? { organizationId: convexOrg._id, startDate: viewRange.start, endDate: viewRange.end }
      : "skip"
  );
  const userCalendarEvents = useQuery(
    api.calendarEvents.getByUser,
    filterByUser && filterUserId
      ? { userId: filterUserId, startDate: viewRange.start, endDate: viewRange.end }
      : "skip"
  );
  const calendarEvents = filterByUser ? userCalendarEvents : orgCalendarEvents;

  // Fetch CRM appointments (org-level or user-level)
  const orgAppointments = useQuery(
    api.appointments.getByOrganization,
    !filterByUser && convexOrg?._id
      ? { organizationId: convexOrg._id, startDate: viewRange.start, endDate: viewRange.end }
      : "skip"
  );
  const userAppointments = useQuery(
    api.appointments.getByUser,
    filterByUser && filterUserId
      ? { userId: filterUserId, startDate: viewRange.start, endDate: viewRange.end }
      : "skip"
  );
  const appointments = filterByUser ? userAppointments : orgAppointments;

  // Merge both event types into unified format
  const events: CalendarEvent[] = useMemo(() => {
    const merged: CalendarEvent[] = [];

    if (calendarEvents) {
      for (const ce of calendarEvents) {
        merged.push({
          id: ce._id,
          title: ce.title,
          startTime: ce.startTime,
          endTime: ce.endTime,
          location: ce.location,
          isAllDay: ce.isAllDay,
          status: ce.status,
          conferenceUrl: ce.conferenceUrl,
          type: "synced",
          attendees: ce.attendees,
        });
      }
    }

    if (appointments) {
      for (const apt of appointments) {
        merged.push({
          id: apt._id,
          title: apt.title,
          startTime: apt.appointmentDate,
          endTime: apt.endDate || apt.appointmentDate + 3600000,
          location: apt.location,
          status: apt.status,
          type: "appointment",
        });
      }
    }

    return merged.sort((a, b) => a.startTime - b.startTime);
  }, [calendarEvents, appointments]);

  if (!convexOrg) {
    return (
      <div className="flex h-[calc(100vh-3rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Resolve the userId for creating appointments — use selected filter user, then convexUser, then first org user
  const effectiveUserId = (selectedUserId !== "all" ? selectedUserId as Id<"users"> : undefined)
    || convexUser?._id
    || orgUsers?.[0]?._id;

  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col">
      {/* Toolbar — user filter for admins */}
      {isAdmin && orgUsers && orgUsers.length > 0 && (
        <div className="flex items-center justify-between px-12 py-2 border-b bg-muted/30">
          <h1 className="text-sm font-medium text-muted-foreground">Calendar</h1>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-52 h-8 text-sm">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {orgUsers.map((u) => (
                <SelectItem key={u._id} value={u._id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Calendar — double-click a day to create an appointment */}
      <div className="flex-1">
        <CalendarView
          events={events}
          loading={calendarEvents === undefined || appointments === undefined}
          onDateClick={(date) => {
            setNewApptDate(date);
            setShowNewAppt(true);
          }}
          onEventClick={(event) => {
            if (event.type === "appointment") {
              setEditApptId(event.id as Id<"appointments">);
            }
          }}
        />
      </div>

      {/* New appointment dialog */}
      <NewAppointmentDialog
        open={showNewAppt}
        onOpenChange={setShowNewAppt}
        organizationId={convexOrg._id}
        userId={effectiveUserId}
        defaultDate={newApptDate}
      />

      {/* Edit appointment dialog */}
      <EditAppointmentDialog
        open={!!editApptId}
        onOpenChange={(open) => { if (!open) setEditApptId(null); }}
        appointmentId={editApptId}
        organizationId={convexOrg._id}
      />
    </div>
  );
}
