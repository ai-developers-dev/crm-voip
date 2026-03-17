"use client";

import { useRef, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCanvasContext } from "./workflow-canvas-provider";
import { stepTypeInfo, type StepType, type StepConfig, type WorkflowStep } from "./workflow-step-card";
import { cn } from "@/lib/utils";
import { Id } from "../../../convex/_generated/dataModel";

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

const stepTypeOptions = Object.entries(stepTypeInfo).map(([value, info]) => ({
  value: value as StepType,
  label: info.label,
  icon: info.icon,
  color: info.color,
  bgColor: info.bgColor,
}));

export function WorkflowStepDetailPanel() {
  const { steps, selectedStepId, updateStep, removeStep, selectStep, organizationId } = useCanvasContext();
  const step = steps.find((s) => s.id === selectedStepId);

  const tags = useQuery(api.contactTags.getActive, { organizationId });
  const users = useQuery(api.users.getByOrganization, { organizationId });
  const pipelines = useQuery(api.pipelines.getByOrganization, { organizationId });
  const stages = useQuery(
    api.pipelineStages.getByPipeline,
    step?.config.pipelineId ? { pipelineId: step.config.pipelineId as Id<"pipelines"> } : "skip"
  );

  const smsRef = useRef<HTMLTextAreaElement>(null);
  const emailBodyRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  if (!step) return null;

  const updateConfig = (patch: Partial<StepConfig>) => {
    updateStep({ ...step, config: { ...step.config, ...patch } });
  };

  const updateType = (type: StepType) => {
    const defaultConfig: Partial<StepConfig> = {};
    if (type === "wait") defaultConfig.waitMinutes = 1440;
    if (type === "create_task") {
      defaultConfig.taskType = "follow_up";
      defaultConfig.taskPriority = "medium";
      defaultConfig.taskDueDays = 1;
    }
    updateStep({ ...step, type, config: defaultConfig });
  };

  const currentInfo = stepTypeInfo[step.type];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b shrink-0">
        <button
          onClick={() => selectStep(null)}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className={cn("flex h-6 w-6 items-center justify-center rounded-md", currentInfo.bgColor)}>
          <currentInfo.icon className={cn("h-3 w-3", currentInfo.color)} />
        </div>
        <span className="text-sm font-semibold flex-1">Edit Step</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Step type grid */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Step Type</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {stepTypeOptions.map(({ value, label, icon: Icon, color, bgColor }) => (
              <button
                key={value}
                type="button"
                onClick={() => updateType(value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center transition-all cursor-pointer",
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

        <div className="border-t" />

        {/* Dynamic config fields */}
        {step.type === "send_sms" && (
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Message Template</Label>
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
                <Label className="text-xs text-muted-foreground mb-1.5 block">Due (days)</Label>
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

        {step.type === "ai_outbound_call" && (
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">AI Agent</Label>
            <Input
              value={step.config.retellAgentId ?? ""}
              onChange={(e) => updateConfig({ retellAgentId: e.target.value })}
              placeholder="Select AI agent in AI Agents settings first"
              className="h-9 text-sm"
              disabled
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Configure AI calling agents in the AI Agents section. The agent will call the contact using their primary phone number.
            </p>
          </div>
        )}

        {step.type === "move_pipeline_stage" && (
          <>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Pipeline</Label>
              <Select
                value={step.config.pipelineId ?? ""}
                onValueChange={(v) => updateConfig({ pipelineId: v, stageId: undefined })}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="Select pipeline..." />
                </SelectTrigger>
                <SelectContent>
                  {pipelines?.map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {step.config.pipelineId && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Stage</Label>
                <Select
                  value={step.config.stageId ?? ""}
                  onValueChange={(v) => updateConfig({ stageId: v })}
                >
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue placeholder="Select stage..." />
                  </SelectTrigger>
                  <SelectContent>
                    {stages?.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
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
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t p-4">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => removeStep(step.id)}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Delete Step
        </Button>
      </div>
    </div>
  );
}
