"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { stepTypeInfo, type WorkflowStep, type StepType } from "./workflow-step-card";
import { cn } from "@/lib/utils";
import { GripVertical, Trash2 } from "lucide-react";
import { useCanvasContext } from "./workflow-canvas-provider";

function getStepSummary(step: WorkflowStep): string {
  const { type, config } = step;
  switch (type) {
    case "send_sms":
      return config.messageTemplate
        ? `"${config.messageTemplate.slice(0, 60)}${config.messageTemplate.length > 60 ? "..." : ""}"`
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
        ? `"${config.noteTemplate.slice(0, 60)}${config.noteTemplate.length > 60 ? "..." : ""}"`
        : "No note set";
    case "assign_contact":
      return config.assignToUserId ? "User selected" : "No user selected";
    case "wait": {
      if (!config.waitMinutes) return "No duration set";
      if (config.waitMinutes < 60) return `${config.waitMinutes} minutes`;
      if (config.waitMinutes < 1440) return `${Math.round(config.waitMinutes / 60)} hours`;
      return `${Math.round(config.waitMinutes / 1440)} days`;
    }
    default:
      return "";
  }
}

interface WorkflowCanvasStepCardProps {
  step: WorkflowStep;
  index: number;
}

export function WorkflowCanvasStepCard({ step, index }: WorkflowCanvasStepCardProps) {
  const { selectedStepId, selectStep, removeStep } = useCanvasContext();
  const isSelected = selectedStepId === step.id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `step-${step.id}`,
    data: { type: "canvas-step", step, index },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const info = stepTypeInfo[step.type];
  const Icon = info.icon;
  const summary = getStepSummary(step);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-lg border bg-card p-3 transition-all cursor-pointer",
        isDragging && "opacity-40 shadow-lg",
        isSelected
          ? "border-primary ring-1 ring-primary/30 shadow-sm"
          : "hover:shadow-sm hover:border-border"
      )}
      onClick={() => selectStep(step.id)}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground/40" />
        </button>

        {/* Step number + icon */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white",
              info.color.replace("text-", "bg-").replace("-600", "-500")
            )}
          >
            {index + 1}
          </span>
          <div className={cn("flex h-7 w-7 items-center justify-center rounded-md", info.bgColor)}>
            <Icon className={cn("h-3.5 w-3.5", info.color)} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pt-0.5">
          <span className="text-sm font-medium">{info.label}</span>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{summary}</p>
        </div>

        {/* Delete */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeStep(step.id);
          }}
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
