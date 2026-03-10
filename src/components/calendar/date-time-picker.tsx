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
} from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

interface DateTimePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  label?: string;
}

export function DateTimePicker({ value, onChange, label }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => value || new Date());

  const displayValue = value ? format(value, "M/d/yy h:mm a") : "Select date & time";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center gap-1.5 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm hover:bg-muted/50 transition-colors text-left whitespace-nowrap overflow-hidden"
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className={value ? "text-foreground" : "text-muted-foreground"}>
            {displayValue}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <PickerContent
          value={value}
          viewMonth={viewMonth}
          onViewMonthChange={setViewMonth}
          onChange={(d) => { onChange(d); setOpen(false); }}
        />
      </PopoverContent>
    </Popover>
  );
}

function PickerContent({
  value,
  viewMonth,
  onViewMonthChange,
  onChange,
}: {
  value: Date | null;
  viewMonth: Date;
  onViewMonthChange: (d: Date) => void;
  onChange: (d: Date) => void;
}) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(value);
  const [hour, setHour] = useState(() => value ? value.getHours() % 12 || 12 : 9);
  const [minute, setMinute] = useState(() => value ? value.getMinutes() : 0);
  const [ampm, setAmpm] = useState<"AM" | "PM">(() => value && value.getHours() >= 12 ? "PM" : "AM");

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const handleConfirm = () => {
    const d = selectedDate || new Date();
    const h24 = ampm === "PM" ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
    const result = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h24, minute, 0, 0);
    onChange(result);
  };

  const handleNow = () => {
    const now = new Date();
    onChange(now);
  };

  return (
    <div className="p-3 space-y-3">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewMonthChange(subMonths(viewMonth, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{format(viewMonth, "MMMM yyyy")}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewMonthChange(addMonths(viewMonth, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">
            {d}
          </div>
        ))}
        {/* Day cells */}
        {days.map((day) => {
          const inMonth = isSameMonth(day, viewMonth);
          const selected = selectedDate && isSameDay(day, selectedDate);
          const today = isToday(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={`h-8 w-8 mx-auto rounded-full text-xs flex items-center justify-center transition-colors ${
                selected
                  ? "bg-primary text-primary-foreground"
                  : today
                    ? "bg-primary/10 text-primary font-semibold"
                    : inMonth
                      ? "hover:bg-muted text-foreground"
                      : "text-muted-foreground/40"
              }`}
              onClick={() => setSelectedDate(day)}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      {/* Time picker */}
      <div className="flex items-center gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">Time</span>
        <div className="flex items-center gap-1 ml-auto">
          <select
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="h-8 w-14 rounded-md border bg-transparent px-1 text-sm text-center"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <span className="text-sm font-medium">:</span>
          <select
            value={minute}
            onChange={(e) => setMinute(Number(e.target.value))}
            className="h-8 w-14 rounded-md border bg-transparent px-1 text-sm text-center"
          >
            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
              <option key={m} value={m}>{m.toString().padStart(2, "0")}</option>
            ))}
          </select>
          <div className="flex rounded-md border overflow-hidden">
            <button
              type="button"
              className={`px-2 py-1 text-xs ${ampm === "AM" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setAmpm("AM")}
            >
              AM
            </button>
            <button
              type="button"
              className={`px-2 py-1 text-xs ${ampm === "PM" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setAmpm("PM")}
            >
              PM
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t pt-3">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={handleNow}>
          Now
        </Button>
        <Button type="button" size="sm" className="h-7 text-xs" onClick={handleConfirm}>
          Confirm
        </Button>
      </div>
    </div>
  );
}
