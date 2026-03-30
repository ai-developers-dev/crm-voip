"use client";

import {
  MessageSquare, Mail, ClipboardCheck, Tag,
  PenLine, UserPlus, Clock, Pencil, Trash2, Plus, Bot, Columns3, GitBranch, BrainCircuit,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StepType =
  | "send_sms"
  | "send_email"
  | "create_task"
  | "add_tag"
  | "remove_tag"
  | "create_note"
  | "assign_contact"
  | "ai_outbound_call"
  | "move_pipeline_stage"
  | "ai_sms_agent"
  | "wait"
  | "if_else";

export interface ConditionDef {
  id: string;
  field: string;
  fieldCategory: string;
  operator: string;
  value?: string;
}

export interface BranchDef {
  id: string;
  name: string;
  conditions: ConditionDef[];
  conditionLogic: "and" | "or";
  steps: WorkflowStep[];
  isDefault?: boolean;
}

export interface StepConfig {
  messageTemplate?: string;
  emailSubject?: string;
  emailBodyTemplate?: string;
  taskTitle?: string;
  taskDescription?: string;
  taskType?: string;
  taskPriority?: string;
  taskDueDays?: number;
  tagId?: string;
  noteTemplate?: string;
  assignToUserId?: string;
  waitMinutes?: number;
  // AI outbound call
  retellAgentId?: string;
  smsAgentId?: string;
  // Pipeline
  pipelineId?: string;
  stageId?: string;
  // If/Else — legacy (kept for backward compat)
  conditions?: ConditionDef[];
  conditionLogic?: "and" | "or";
  yesBranch?: WorkflowStep[];
  noBranch?: WorkflowStep[];
  // If/Else — new multi-branch format
  branches?: BranchDef[];
}

export interface WorkflowStep {
  id: string;
  order: number;
  type: StepType;
  config: StepConfig;
}

const stepTypeInfo: Record<StepType, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}> = {
  send_sms: { label: "Send SMS", icon: MessageSquare, color: "text-blue-600", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
  send_email: { label: "Send Email", icon: Mail, color: "text-amber-600", bgColor: "bg-amber-100 dark:bg-amber-900/30" },
  create_task: { label: "Create Task", icon: ClipboardCheck, color: "text-green-600", bgColor: "bg-green-100 dark:bg-green-900/30" },
  add_tag: { label: "Add Tag", icon: Tag, color: "text-orange-600", bgColor: "bg-orange-100 dark:bg-orange-900/30" },
  remove_tag: { label: "Remove Tag", icon: Tag, color: "text-red-600", bgColor: "bg-red-100 dark:bg-red-900/30" },
  create_note: { label: "Create Note", icon: PenLine, color: "text-purple-600", bgColor: "bg-purple-100 dark:bg-purple-900/30" },
  assign_contact: { label: "Assign Contact", icon: UserPlus, color: "text-indigo-600", bgColor: "bg-indigo-100 dark:bg-indigo-900/30" },
  ai_outbound_call: { label: "AI Call", icon: Bot, color: "text-cyan-600", bgColor: "bg-cyan-100 dark:bg-cyan-900/30" },
  move_pipeline_stage: { label: "Move Pipeline", icon: Columns3, color: "text-teal-600", bgColor: "bg-teal-100 dark:bg-teal-900/30" },
  wait: { label: "Wait", icon: Clock, color: "text-gray-600", bgColor: "bg-gray-100 dark:bg-gray-800/50" },
  if_else: { label: "If/Else", icon: GitBranch, color: "text-yellow-600", bgColor: "bg-yellow-100 dark:bg-yellow-900/30" },
  ai_sms_agent: { label: "AI SMS Agent", icon: BrainCircuit, color: "text-violet-600", bgColor: "bg-violet-100 dark:bg-violet-900/30" },
};

/** Convert legacy yesBranch/noBranch format to multi-branch format */
export function normalizeBranches(config: StepConfig): BranchDef[] {
  if (config.branches && config.branches.length > 0) return config.branches;
  // Legacy format → new format
  return [
    {
      id: "legacy-yes",
      name: "Branch",
      conditions: (config.conditions || []) as ConditionDef[],
      conditionLogic: (config.conditionLogic as "and" | "or") || "and",
      steps: (config.yesBranch || []) as WorkflowStep[],
    },
    {
      id: "legacy-none",
      name: "None",
      conditions: [],
      conditionLogic: "and" as const,
      steps: (config.noBranch || []) as WorkflowStep[],
      isDefault: true,
    },
  ];
}

export function getStepSummary(step: WorkflowStep): string {
  const { type, config } = step;
  switch (type) {
    case "send_sms":
      return config.messageTemplate
        ? `"${config.messageTemplate.slice(0, 80)}${config.messageTemplate.length > 80 ? "..." : ""}"`
        : "No message set";
    case "send_email":
      return config.emailSubject || "No subject set";
    case "create_task":
      return [config.taskTitle, config.taskPriority ? `${config.taskPriority} priority` : null]
        .filter(Boolean).join(" — ") || "No title set";
    case "add_tag":
    case "remove_tag":
      return config.tagId ? "Tag selected" : "No tag selected";
    case "create_note":
      return config.noteTemplate
        ? `"${config.noteTemplate.slice(0, 80)}${config.noteTemplate.length > 80 ? "..." : ""}"`
        : "No note set";
    case "assign_contact":
      return config.assignToUserId ? "User selected" : "No user selected";
    case "ai_outbound_call":
      return config.retellAgentId ? "AI agent selected" : "No AI agent selected";
    case "ai_sms_agent":
      return config.smsAgentId ? "SMS agent selected" : "No SMS agent selected";
    case "move_pipeline_stage":
      return config.pipelineId && config.stageId ? "Pipeline stage selected" : "No stage selected";
    case "wait": {
      if (!config.waitMinutes) return "No duration set";
      if (config.waitMinutes < 60) return `${config.waitMinutes} minutes`;
      if (config.waitMinutes < 1440) return `${Math.round(config.waitMinutes / 60)} hours`;
      return `${Math.round(config.waitMinutes / 1440)} days`;
    }
    case "if_else": {
      const branches = normalizeBranches(config);
      const namedBranches = branches.filter(b => !b.isDefault);
      if (namedBranches.length === 0) return "No branches set";
      const totalConditions = namedBranches.reduce((sum, b) => sum + b.conditions.length, 0);
      if (totalConditions === 0) return `${namedBranches.length} branch${namedBranches.length !== 1 ? "es" : ""} — no conditions`;
      return `${namedBranches.length} branch${namedBranches.length !== 1 ? "es" : ""}, ${totalConditions} condition${totalConditions !== 1 ? "s" : ""}`;
    }
    default:
      return "";
  }
}

interface WorkflowStepCardProps {
  step: WorkflowStep;
  index: number;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onInsertAfter?: () => void;
}

export function WorkflowStepCard({ step, index, isLast, onEdit, onDelete, onInsertAfter }: WorkflowStepCardProps) {
  const info = stepTypeInfo[step.type];
  const Icon = info.icon;
  const summary = getStepSummary(step);

  return (
    <div>
      {/* Step card */}
      <div
        className="group rounded-lg border bg-card p-3 transition-shadow cursor-pointer"
        onClick={onEdit}
      >
        <div className="flex items-start gap-3">
          {/* Step number + icon wrap */}
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white",
              info.color.replace("text-", "bg-").replace("-600", "-500")
            )}>
              {index + 1}
            </span>
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-md", info.bgColor)}>
              <Icon className={cn("h-3.5 w-3.5", info.color)} />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pt-0.5">
            <span className="text-sm font-medium">{info.label}</span>
            <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{summary}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 rounded text-on-surface-variant hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Dashed connector with insert button */}
      {!isLast && (
        <div className="group/connector flex justify-center py-1">
          <div className="flex flex-col items-center relative">
            <div className="w-px h-2 border-l border-dashed border-border" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onInsertAfter?.(); }}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border/60 text-on-surface-variant/40 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer group-hover/connector:border-border group-hover/connector:text-on-surface-variant"
              title="Insert step"
            >
              <Plus className="h-3 w-3" />
            </button>
            <div className="w-px h-2 border-l border-dashed border-border" />
          </div>
        </div>
      )}
    </div>
  );
}

export { stepTypeInfo };
