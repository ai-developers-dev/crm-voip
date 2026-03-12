"use client";

import { useState, useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  startOfDay,
  endOfDay,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { calendarEventColors } from "@/lib/style-constants";

export type CalendarEvent = {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  location?: string;
  isAllDay?: boolean;
  status: string;
  conferenceUrl?: string;
  type: "synced" | "appointment";
  attendees?: { email: string; name?: string; status: string }[];
  contactName?: string;
};

type ViewMode = "month" | "week" | "day";

interface CalendarViewProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;

  loading?: boolean;
}

export function CalendarView({ events, onEventClick, onDateClick, loading }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");

  const navigate = (direction: "prev" | "next") => {
    const fn = direction === "prev"
      ? viewMode === "month" ? subMonths : viewMode === "week" ? subWeeks : subDays
      : viewMode === "month" ? addMonths : viewMode === "week" ? addWeeks : addDays;
    setCurrentDate(fn(currentDate, 1));
  };

  const goToToday = () => setCurrentDate(new Date());

  const headerLabel = useMemo(() => {
    if (viewMode === "day") return format(currentDate, "EEEE, MMMM d, yyyy");
    if (viewMode === "week") {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
      return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;
    }
    return format(currentDate, "MMMM yyyy");
  }, [currentDate, viewMode]);

  return (
    <div className="flex flex-col h-full px-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between py-3 border-b">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("prev")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("next")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="text-sm font-semibold">{headerLabel}</h2>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          {(["month", "week", "day"] as const).map((mode) => (
            <Button
              key={mode}
              variant={viewMode === mode ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs capitalize"
              onClick={() => setViewMode(mode)}
            >
              {mode}
            </Button>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto relative">
        {loading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-5 w-5 animate-pulse" />
              <span>Loading events...</span>
            </div>
          </div>
        )}
        {viewMode === "month" && (
          <MonthView
            currentDate={currentDate}
            events={events}
            onEventClick={(e) => onEventClick?.(e)}
            onDateClick={onDateClick}
          />
        )}
        {viewMode === "week" && (
          <WeekView
            currentDate={currentDate}
            events={events}
            onEventClick={(e) => onEventClick?.(e)}
          />
        )}
        {viewMode === "day" && (
          <DayView
            currentDate={currentDate}
            events={events}
            onEventClick={(e) => onEventClick?.(e)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Month View ──────────────────────────────────────────────

function MonthView({
  currentDate,
  events,
  onEventClick,
  onDateClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;

}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const dayKey = format(new Date(event.startTime), "yyyy-MM-dd");
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey)!.push(event);
    }
    return map;
  }, [events]);

  return (
    <div className="h-full flex flex-col">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="px-2 py-1.5 text-xs font-medium text-muted-foreground text-center">
            {day}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 flex-1 auto-rows-fr">
        {days.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDay.get(dayKey) || [];
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);

          return (
            <div
              key={dayKey}
              className={`border-b border-r p-1 min-h-[80px] cursor-pointer hover:bg-muted/30 transition-colors ${
                !inMonth ? "bg-muted/10" : ""
              }`}
              onClick={() => onDateClick?.(day)}
            >
              <div className={`text-xs font-medium mb-0.5 w-6 h-6 flex items-center justify-center rounded-full ${
                today
                  ? "bg-primary text-primary-foreground"
                  : !inMonth
                    ? "text-muted-foreground/50"
                    : "text-foreground"
              }`}>
                {format(day, "d")}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    className={`w-full text-left text-xs leading-snug px-1 py-0.5 rounded truncate ${
                      event.type === "synced" ? calendarEventColors.synced : calendarEventColors.appointment
                    }`}
                    onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                  >
                    {event.isAllDay ? event.title : `${format(new Date(event.startTime), "h:mm")} ${event.title}`}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-xs text-muted-foreground px-1">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week View ───────────────────────────────────────────────

function WeekView({
  currentDate,
  events,
  onEventClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(currentDate, { weekStartsOn: 0 }) });
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const getEventsForDay = (day: Date) =>
    events.filter((e) => {
      const eventDay = new Date(e.startTime);
      return isSameDay(eventDay, day);
    });

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b sticky top-0 bg-background z-10">
        <div className="border-r" />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={`px-2 py-2 text-center border-r ${isToday(day) ? "bg-primary/5" : ""}`}
          >
            <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
            <div className={`text-sm font-semibold ${
              isToday(day) ? "text-primary" : ""
            }`}>
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>
      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] min-h-[1440px]">
          {/* Time labels */}
          <div className="border-r">
            {hours.map((hour) => (
              <div key={hour} className="h-[60px] pr-2 flex items-start justify-end">
                <span className="text-xs text-muted-foreground -mt-2">
                  {hour === 0 ? "" : format(new Date(2000, 0, 1, hour), "h a")}
                </span>
              </div>
            ))}
          </div>
          {/* Day columns */}
          {days.map((day) => {
            const dayEvents = getEventsForDay(day);
            return (
              <div key={day.toISOString()} className="border-r relative">
                {hours.map((hour) => (
                  <div key={hour} className="h-[60px] border-b border-border/30" />
                ))}
                {/* Event overlays */}
                {dayEvents.filter((e) => !e.isAllDay).map((event) => {
                  const start = new Date(event.startTime);
                  const end = new Date(event.endTime);
                  const topMinutes = start.getHours() * 60 + start.getMinutes();
                  const durationMinutes = Math.max((end.getTime() - start.getTime()) / 60000, 30);
                  return (
                    <button
                      key={event.id}
                      className={`absolute left-0.5 right-1 rounded px-1.5 py-0.5 text-xs leading-tight overflow-hidden ${
                        event.type === "synced"
                          ? `${calendarEventColors.synced} border-l-2 border-emerald-500`
                          : `${calendarEventColors.appointment} border-l-2 border-blue-500`
                      }`}
                      style={{
                        top: `${topMinutes}px`,
                        height: `${Math.min(durationMinutes, 1440 - topMinutes)}px`,
                        minHeight: "20px",
                      }}
                      onClick={() => onEventClick(event)}
                    >
                      <div className="font-medium truncate">{event.title}</div>
                      {durationMinutes > 40 && (
                        <div className="truncate opacity-70">
                          {format(start, "h:mm a")} - {format(end, "h:mm a")}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Day View ────────────────────────────────────────────────

function DayView({
  currentDate,
  events,
  onEventClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const dayStart = startOfDay(currentDate);
  const dayEnd = endOfDay(currentDate);
  const dayEvents = events.filter((e) => {
    const start = new Date(e.startTime);
    return start >= dayStart && start <= dayEnd;
  });
  const allDayEvents = dayEvents.filter((e) => e.isAllDay);
  const timedEvents = dayEvents.filter((e) => !e.isAllDay);

  return (
    <div className="flex flex-col h-full">
      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="border-b p-2 space-y-1">
          <div className="text-xs text-muted-foreground font-medium mb-1">All day</div>
          {allDayEvents.map((event) => (
            <button
              key={event.id}
              className={`w-full text-left text-xs px-2 py-1 rounded ${
                event.type === "synced" ? calendarEventColors.synced : calendarEventColors.appointment
              }`}
              onClick={() => onEventClick(event)}
            >
              {event.title}
            </button>
          ))}
        </div>
      )}
      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-[60px_1fr] min-h-[1440px]">
          <div className="border-r">
            {hours.map((hour) => (
              <div key={hour} className="h-[60px] pr-2 flex items-start justify-end">
                <span className="text-xs text-muted-foreground -mt-2">
                  {hour === 0 ? "" : format(new Date(2000, 0, 1, hour), "h a")}
                </span>
              </div>
            ))}
          </div>
          <div className="relative">
            {hours.map((hour) => (
              <div key={hour} className="h-[60px] border-b border-border/30" />
            ))}
            {timedEvents.map((event) => {
              const start = new Date(event.startTime);
              const end = new Date(event.endTime);
              const topMinutes = start.getHours() * 60 + start.getMinutes();
              const durationMinutes = Math.max((end.getTime() - start.getTime()) / 60000, 30);
              return (
                <button
                  key={event.id}
                  className={`absolute left-1 right-4 rounded px-2 py-1 text-xs overflow-hidden ${
                    event.type === "synced"
                      ? `${calendarEventColors.synced} border-l-2 border-emerald-500`
                      : `${calendarEventColors.appointment} border-l-2 border-blue-500`
                  }`}
                  style={{
                    top: `${topMinutes}px`,
                    height: `${Math.min(durationMinutes, 1440 - topMinutes)}px`,
                    minHeight: "24px",
                  }}
                  onClick={() => onEventClick(event)}
                >
                  <div className="font-medium">{event.title}</div>
                  <div className="opacity-70">
                    {format(start, "h:mm a")} - {format(end, "h:mm a")}
                  </div>
                  {event.location && (
                    <div className="opacity-60 truncate">{event.location}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

