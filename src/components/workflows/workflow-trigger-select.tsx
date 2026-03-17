"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  UserPlus, Tag, PhoneMissed, MessageSquare,
  CalendarClock, AlertCircle, Play, Bot, PhoneForwarded,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type TriggerType =
  | "contact_created"
  | "tag_added"
  | "missed_call"
  | "incoming_sms"
  | "appointment_reminder"
  | "task_overdue"
  | "ai_call_completed"
  | "ai_call_transferred"
  | "manual";

export interface TriggerConfig {
  tagId?: Id<"contactTags">;
  reminderMinutes?: number;
  overdueMinutes?: number;
}

const triggerOptions: {
  value: TriggerType;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}[] = [
  { value: "contact_created", label: "New Contact Created", shortLabel: "New Contact", icon: UserPlus, color: "text-emerald-600", bgColor: "bg-emerald-100 dark:bg-emerald-900/30" },
  { value: "tag_added", label: "Tag Added", shortLabel: "Tag Added", icon: Tag, color: "text-orange-600", bgColor: "bg-orange-100 dark:bg-orange-900/30" },
  { value: "missed_call", label: "Missed Call", shortLabel: "Missed Call", icon: PhoneMissed, color: "text-red-600", bgColor: "bg-red-100 dark:bg-red-900/30" },
  { value: "incoming_sms", label: "Incoming SMS", shortLabel: "Incoming SMS", icon: MessageSquare, color: "text-blue-600", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
  { value: "appointment_reminder", label: "Appointment Reminder", shortLabel: "Reminder", icon: CalendarClock, color: "text-purple-600", bgColor: "bg-purple-100 dark:bg-purple-900/30" },
  { value: "task_overdue", label: "Task Overdue", shortLabel: "Overdue", icon: AlertCircle, color: "text-amber-600", bgColor: "bg-amber-100 dark:bg-amber-900/30" },
  { value: "ai_call_completed", label: "AI Call Completed", shortLabel: "AI Call Done", icon: Bot, color: "text-cyan-600", bgColor: "bg-cyan-100 dark:bg-cyan-900/30" },
  { value: "ai_call_transferred", label: "AI Call Transferred", shortLabel: "AI Transfer", icon: PhoneForwarded, color: "text-indigo-600", bgColor: "bg-indigo-100 dark:bg-indigo-900/30" },
  { value: "manual", label: "Manual", shortLabel: "Manual", icon: Play, color: "text-gray-600", bgColor: "bg-gray-100 dark:bg-gray-800/50" },
];

const reminderOptions = [
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 1440, label: "1 day before" },
];

interface WorkflowTriggerSelectProps {
  triggerType: TriggerType;
  triggerConfig?: TriggerConfig;
  organizationId: Id<"organizations">;
  onTriggerTypeChange: (type: TriggerType) => void;
  onTriggerConfigChange: (config: TriggerConfig) => void;
}

export function WorkflowTriggerSelect({
  triggerType,
  triggerConfig,
  organizationId,
  onTriggerTypeChange,
  onTriggerConfigChange,
}: WorkflowTriggerSelectProps) {
  const tags = useQuery(api.contactTags.getActive, { organizationId });

  return (
    <div className="space-y-3">
      {/* Trigger type grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {triggerOptions.map(({ value, shortLabel, icon: Icon, color, bgColor }) => (
          <button
            key={value}
            type="button"
            onClick={() => onTriggerTypeChange(value)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-center transition-all cursor-pointer",
              triggerType === value
                ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-sm"
                : "border-transparent bg-muted/40 hover:bg-muted/70 hover:border-border"
            )}
          >
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-md", bgColor)}>
              <Icon className={cn("h-3.5 w-3.5", color)} />
            </div>
            <span className={cn(
              "text-[10px] leading-tight font-medium",
              triggerType === value ? "text-foreground" : "text-muted-foreground"
            )}>
              {shortLabel}
            </span>
          </button>
        ))}
      </div>

      {/* Trigger-specific config */}
      {triggerType === "tag_added" && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Which tag?</Label>
          <Select
            value={triggerConfig?.tagId ?? ""}
            onValueChange={(v) => onTriggerConfigChange({ ...triggerConfig, tagId: v as Id<"contactTags"> })}
          >
            <SelectTrigger className="w-full h-9 text-sm">
              <SelectValue placeholder="Select a tag..." />
            </SelectTrigger>
            <SelectContent>
              {tags?.map((tag) => (
                <SelectItem key={tag._id} value={tag._id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {triggerType === "appointment_reminder" && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Remind before</Label>
          <Select
            value={String(triggerConfig?.reminderMinutes ?? 30)}
            onValueChange={(v) => onTriggerConfigChange({ ...triggerConfig, reminderMinutes: Number(v) })}
          >
            <SelectTrigger className="w-full h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {reminderOptions.map(({ value, label }) => (
                <SelectItem key={value} value={String(value)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {triggerType === "task_overdue" && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Minutes past due</Label>
          <Select
            value={String(triggerConfig?.overdueMinutes ?? 0)}
            onValueChange={(v) => onTriggerConfigChange({ ...triggerConfig, overdueMinutes: Number(v) })}
          >
            <SelectTrigger className="w-full h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Immediately when overdue</SelectItem>
              <SelectItem value="15">15 minutes past due</SelectItem>
              <SelectItem value="30">30 minutes past due</SelectItem>
              <SelectItem value="60">1 hour past due</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

export { triggerOptions };
