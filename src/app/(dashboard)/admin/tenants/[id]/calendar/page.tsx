"use client";

import { useMemo, useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../convex/_generated/dataModel";
import { CalendarView, type CalendarEvent } from "@/components/calendar/calendar-view";
import { NewAppointmentDialog } from "@/components/calendar/new-appointment-dialog";
import { EditAppointmentDialog } from "@/components/calendar/edit-appointment-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Eye, Loader2, Settings, Phone, MessageSquare,
  Users, Calendar, BarChart3,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  startOfMonth, endOfMonth, subMonths, addMonths,
} from "date-fns";

export default function TenantCalendarPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoaded: userLoaded } = useUser();
  const tenantId = params.id as string;
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

  const isPlatformUser = useQuery(
    api.platformUsers.isPlatformUser,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  const tenant = useQuery(
    api.organizations.getById,
    tenantId ? { organizationId: tenantId as Id<"organizations"> } : "skip"
  );

  const tenantUsers = useQuery(
    api.users.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  const filterByUser = selectedUserId !== "all";
  const filterUserId = filterByUser ? (selectedUserId as Id<"users">) : undefined;

  // Calendar events — org-level or user-level
  const orgCalendarEvents = useQuery(
    api.calendarEvents.getByOrganization,
    !filterByUser && tenant?._id
      ? { organizationId: tenant._id, startDate: viewRange.start, endDate: viewRange.end }
      : "skip"
  );
  const userCalendarEvents = useQuery(
    api.calendarEvents.getByUser,
    filterByUser && filterUserId
      ? { userId: filterUserId, startDate: viewRange.start, endDate: viewRange.end }
      : "skip"
  );
  const calendarEvents = filterByUser ? userCalendarEvents : orgCalendarEvents;

  // Appointments — org-level or user-level
  const orgAppointments = useQuery(
    api.appointments.getByOrganization,
    !filterByUser && tenant?._id
      ? { organizationId: tenant._id, startDate: viewRange.start, endDate: viewRange.end }
      : "skip"
  );
  const userAppointments = useQuery(
    api.appointments.getByUser,
    filterByUser && filterUserId
      ? { userId: filterUserId, startDate: viewRange.start, endDate: viewRange.end }
      : "skip"
  );
  const appointments = filterByUser ? userAppointments : orgAppointments;

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

  if (!userLoaded || isPlatformUser === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isPlatformUser) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don&apos;t have permission to view tenant dashboards.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/dashboard")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tenant === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tenant === null) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Tenant Not Found</CardTitle>
            <CardDescription>
              The tenant organization you&apos;re looking for doesn&apos;t exist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin">
              <Button className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Impersonation Banner */}
      <Alert className="rounded-none border-x-0 border-t-0 bg-amber-500/10 border-amber-500/20">
        <Eye className="h-4 w-4 text-amber-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-amber-700 dark:text-amber-400">
            <strong>Viewing as:</strong> {tenant.name} ({tenant.plan} plan)
          </span>
          <Link href="/admin">
            <Button variant="outline" size="sm" className="border-amber-500/30 hover:bg-amber-500/10">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
        </AlertDescription>
      </Alert>

      {/* Navigation Menu */}
      <div className="border-b bg-muted/30 px-4 py-2">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1">
            <Link href={`/admin/tenants/${tenant._id}`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <Phone className="h-4 w-4" />
                Calls
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/sms`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                SMS
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/contacts`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <Users className="h-4 w-4" />
                Contacts
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/calendar`}>
              <Button variant="secondary" size="sm" className="gap-2">
                <Calendar className="h-4 w-4" />
                Calendar
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/reports`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Reports
              </Button>
            </Link>
          </nav>
          <Link href={`/admin/tenants/${tenant._id}/settings`}>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* User filter */}
      {tenantUsers && tenantUsers.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/10">
          <span className="text-sm text-muted-foreground">Filter by user</span>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-52 h-8 text-sm">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {tenantUsers.map((u) => (
                <SelectItem key={u._id} value={u._id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Calendar */}
      <div className="flex-1 relative">
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
      {tenantUsers && tenantUsers.length > 0 && (
        <NewAppointmentDialog
          open={showNewAppt}
          onOpenChange={setShowNewAppt}
          organizationId={tenant._id}
          userId={selectedUserId !== "all" ? (selectedUserId as Id<"users">) : tenantUsers[0]._id}
          defaultDate={newApptDate}
        />
      )}

      {/* Edit appointment dialog */}
      <EditAppointmentDialog
        open={!!editApptId}
        onOpenChange={(open) => { if (!open) setEditApptId(null); }}
        appointmentId={editApptId}
        organizationId={tenant._id}
      />
    </div>
  );
}
