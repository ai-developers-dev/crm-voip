"use client";

import { useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bell, PhoneMissed, MessageSquare, Mail, ClipboardCheck, Calendar, X,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  PhoneMissed,
  MessageSquare,
  Mail,
  ClipboardCheck,
  Calendar,
};

const TYPE_COLORS: Record<string, string> = {
  missed_call: "text-red-500",
  unread_sms: "text-blue-500",
  unread_email: "text-amber-500",
  task_due: "text-orange-500",
  task_overdue: "text-red-600",
  upcoming_appointment: "text-green-500",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 0) return `in ${Math.abs(mins)}m`;
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface NotificationBellProps {
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
}

export function NotificationBell({ organizationId, userId }: NotificationBellProps) {
  const notifications = useQuery(api.notifications.getForUser, {
    organizationId,
    userId,
  });

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const activeNotifications = (notifications || []).filter((n) => !dismissedIds.has(n.id));
  const count = activeNotifications.length;

  const dismissOne = useCallback((id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  const dismissAll = useCallback(() => {
    if (notifications) {
      setDismissedIds(new Set(notifications.map((n) => n.id)));
    }
    setOpen(false);
  }, [notifications]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-1.5 rounded-xl hover:bg-surface-container-high transition-colors">
          <Bell className="h-4 w-4 text-on-surface-variant" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
        <div className="px-3 py-2 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Notifications</h3>
            <p className="text-[10px] text-on-surface-variant">{count} item{count !== 1 ? "s" : ""}</p>
          </div>
          {count > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={dismissAll}>
              Clear All
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {count === 0 ? (
            <div className="py-8 text-center">
              <Bell className="h-8 w-8 text-on-surface-variant/20 mx-auto mb-2" />
              <p className="text-xs text-on-surface-variant">No notifications</p>
            </div>
          ) : (
            activeNotifications.map((n) => {
              const Icon = ICONS[n.icon] || Bell;
              const color = TYPE_COLORS[n.type] || "text-on-surface-variant";
              const isTask = n.type === "task_due" || n.type === "task_overdue";
              const href = n.contactId
                ? `/contacts?id=${n.contactId}${isTask ? "&panel=tasks" : ""}`
                : "#";

              return (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-3 py-2.5 hover:bg-surface-container-high/50 transition-colors last:border-b-0 group"
                >
                  <Link href={href} onClick={() => { dismissOne(n.id); setOpen(false); }} className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={cn("mt-0.5 shrink-0", color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold truncate">{n.title}</p>
                        <span className="text-[10px] text-on-surface-variant shrink-0">{timeAgo(n.timestamp)}</span>
                      </div>
                      <p className="text-xs text-on-surface-variant line-clamp-1">{n.description}</p>
                      {n.contactName && (
                        <p className="text-[10px] text-primary mt-0.5">{n.contactName}</p>
                      )}
                    </div>
                  </Link>
                  <button
                    onClick={() => dismissOne(n.id)}
                    className="mt-1 shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-container-high transition-all"
                  >
                    <X className="h-3 w-3 text-on-surface-variant" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
