"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StepType, StepConfig, WorkflowStep } from "./workflow-step-card";
import { stepTypeInfo } from "./workflow-step-card";
import { useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

const stepTypeOptions = Object.entries(stepTypeInfo).map(([value, info]) => ({
  value: value as StepType,
  label: info.label,
  icon: info.icon,
  color: info.color,
  bgColor: info.bgColor,
}));

const templateVariables = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "fullName", label: "Full Name" },
  { key: "email", label: "Email" },
  { key: "company", label: "Company" },
  { key: "phone", label: "Phone" },
  { key: "agentName", label: "Agent Name" },
  { key: "agencyName", label: "Agency Name" },
];

function VariableChips({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (val: string) => void;
}) {
  const insertVariable = useCallback(
    (varKey: string) => {
      const el = textareaRef.current;
      const insertion = `{{${varKey}}}`;
      if (el) {
        const start = el.selectionStart ?? value.length;
        const end = el.selectionEnd ?? value.length;
        const newVal = value.slice(0, start) + insertion + value.slice(end);
        onChange(newVal);
        requestAnimationFrame(() => {
          el.focus();
          const pos = start + insertion.length;
          el.setSelectionRange(pos, pos);
        });
      } else {
        onChange(value + insertion);
      }
    },
    [textareaRef, value, onChange]
  );

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {templateVariables.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => insertVariable(v.key)}
          className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

interface WorkflowStepEditorProps {
  step: WorkflowStep;
  organizationId: Id<"organizations">;
  onChange: (step: WorkflowStep) => void;
  onDone: () => void;
  onCancel: () => void;
}

export function WorkflowStepEditor({
  step,
  organizationId,
  onChange,
  onDone,
  onCancel,
}: WorkflowStepEditorProps) {
  const tags = useQuery(api.contactTags.getActive, { organizationId });
  const users = useQuery(api.users.getByOrganization, { organizationId });

  const smsRef = useRef<HTMLTextAreaElement>(null);
  const emailBodyRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const updateConfig = (patch: Partial<StepConfig>) => {
    onChange({ ...step, config: { ...step.config, ...patch } });
  };

  const updateType = (type: StepType) => {
    const defaultConfig: Partial<StepConfig> = {};
    if (type === "wait") defaultConfig.waitMinutes = 1440;
    if (type === "create_task") { defaultConfig.taskType = "follow_up"; defaultConfig.taskPriority = "medium"; defaultConfig.taskDueDays = 1; }
    onChange({ ...step, type, config: defaultConfig });
  };

  const currentInfo = stepTypeInfo[step.type];
  const accentBorder = currentInfo.color.replace("text-", "border-t-");

  return (
    <div className={cn("rounded-lg border border-t-2 bg-card p-4 space-y-3 shadow-sm", accentBorder)}>
      {/* Step type grid selector */}
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Step Type</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {stepTypeOptions.map(({ value, label, icon: Icon, color, bgColor }) => (
            <button
              key={value}
              type="button"
              onClick={() => updateType(value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-center transition-all cursor-pointer",
                step.type === value
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-transparent bg-muted/40 hover:bg-muted/70 hover:border-border"
              )}
            >
              <div className={cn("flex h-6 w-6 items-center justify-center rounded-md", bgColor)}>
                <Icon className={cn("h-3 w-3", color)} />
              </div>
              <span className={cn(
                "text-[9px] leading-tight font-medium",
                step.type === value ? "text-foreground" : "text-muted-foreground"
              )}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Separator */}
      <div className="border-t" />

      {/* Dynamic config fields based on step type */}
      {step.type === "send_sms" && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">
            Message Template
          </Label>
          <Textarea
            ref={smsRef}
            value={step.config.messageTemplate ?? ""}
            onChange={(e) => updateConfig({ messageTemplate: e.target.value })}
            placeholder='Hi {{firstName}}, thanks for reaching out!'
            className="text-sm min-h-[80px]"
          />
          <VariableChips
            textareaRef={smsRef}
            value={step.config.messageTemplate ?? ""}
            onChange={(val) => updateConfig({ messageTemplate: val })}
          />
        </div>
      )}

      {step.type === "send_email" && (
        <>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Subject</Label>
            <Input
              value={step.config.emailSubject ?? ""}
              onChange={(e) => updateConfig({ emailSubject: e.target.value })}
              placeholder="Welcome to {{agencyName}}"
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Body</Label>
            <Textarea
              ref={emailBodyRef}
              value={step.config.emailBodyTemplate ?? ""}
              onChange={(e) => updateConfig({ emailBodyTemplate: e.target.value })}
              placeholder="Dear {{firstName}},..."
              className="text-sm min-h-[80px]"
            />
            <VariableChips
              textareaRef={emailBodyRef}
              value={step.config.emailBodyTemplate ?? ""}
              onChange={(val) => updateConfig({ emailBodyTemplate: val })}
            />
          </div>
        </>
      )}

      {step.type === "create_task" && (
        <>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Task Title</Label>
            <Input
              value={step.config.taskTitle ?? ""}
              onChange={(e) => updateConfig({ taskTitle: e.target.value })}
              placeholder="Follow up with {{firstName}}"
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Description</Label>
            <Textarea
              value={step.config.taskDescription ?? ""}
              onChange={(e) => updateConfig({ taskDescription: e.target.value })}
              placeholder="Optional description..."
              className="text-sm min-h-[60px]"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Type</Label>
              <Select
                value={step.config.taskType ?? "follow_up"}
                onValueChange={(v) => updateConfig({ taskType: v })}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call_back">Call Back</SelectItem>
                  <SelectItem value="follow_up">Follow Up</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="quote">Quote</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Priority</Label>
              <Select
                value={step.config.taskPriority ?? "medium"}
                onValueChange={(v) => updateConfig({ taskPriority: v })}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Due in (days)</Label>
              <Input
                type="number"
                min={0}
                value={step.config.taskDueDays ?? 1}
                onChange={(e) => updateConfig({ taskDueDays: Number(e.target.value) })}
                className="h-9 text-sm"
              />
            </div>
          </div>
        </>
      )}

      {(step.type === "add_tag" || step.type === "remove_tag") && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Tag</Label>
          <Select
            value={step.config.tagId ?? ""}
            onValueChange={(v) => updateConfig({ tagId: v })}
          >
            <SelectTrigger className="h-9 w-full text-sm">
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

      {step.type === "create_note" && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Note Template</Label>
          <Textarea
            ref={noteRef}
            value={step.config.noteTemplate ?? ""}
            onChange={(e) => updateConfig({ noteTemplate: e.target.value })}
            placeholder="Automated note: {{firstName}} was contacted via workflow..."
            className="text-sm min-h-[80px]"
          />
          <VariableChips
            textareaRef={noteRef}
            value={step.config.noteTemplate ?? ""}
            onChange={(val) => updateConfig({ noteTemplate: val })}
          />
        </div>
      )}

      {step.type === "assign_contact" && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Assign to</Label>
          <Select
            value={step.config.assignToUserId ?? ""}
            onValueChange={(v) => updateConfig({ assignToUserId: v })}
          >
            <SelectTrigger className="h-9 w-full text-sm">
              <SelectValue placeholder="Select a user..." />
            </SelectTrigger>
            <SelectContent>
              {users?.map((u) => (
                <SelectItem key={u._id} value={u._id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {step.type === "wait" && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Wait Duration</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              value={
                step.config.waitMinutes
                  ? step.config.waitMinutes >= 1440
                    ? Math.round(step.config.waitMinutes / 1440)
                    : step.config.waitMinutes >= 60
                      ? Math.round(step.config.waitMinutes / 60)
                      : step.config.waitMinutes
                  : 1
              }
              onChange={(e) => {
                const val = Number(e.target.value);
                const unit = !step.config.waitMinutes ? 1440
                  : step.config.waitMinutes >= 1440 ? 1440
                  : step.config.waitMinutes >= 60 ? 60
                  : 1;
                updateConfig({ waitMinutes: val * unit });
              }}
              className="h-9 text-sm w-20"
            />
            <Select
              value={
                !step.config.waitMinutes ? "days"
                : step.config.waitMinutes >= 1440 ? "days"
                : step.config.waitMinutes >= 60 ? "hours"
                : "minutes"
              }
              onValueChange={(unit) => {
                const current = step.config.waitMinutes || 1440;
                const rawVal = current >= 1440 ? Math.round(current / 1440)
                  : current >= 60 ? Math.round(current / 60)
                  : current;
                const multiplier = unit === "days" ? 1440 : unit === "hours" ? 60 : 1;
                updateConfig({ waitMinutes: rawVal * multiplier });
              }}
            >
              <SelectTrigger className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1 border-t">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
