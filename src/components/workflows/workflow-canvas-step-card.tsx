"use client";

import { stepTypeInfo, getStepSummary, type WorkflowStep } from "./workflow-step-card";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { useCanvasContext } from "./workflow-canvas-provider";

interface WorkflowCanvasStepCardProps {
  step: WorkflowStep;
  index: number;
}

export function WorkflowCanvasStepCard({ step, index }: WorkflowCanvasStepCardProps) {
  const { steps, selectedStepId, selectStep, removeStep, reorderSteps } = useCanvasContext();
  const isSelected = selectedStepId === step.id;
  const isFirst = index === 0;
  const isLast = index === steps.length - 1 || steps[index + 1]?.type === "if_else";

  const info = stepTypeInfo[step.type];
  const Icon = info.icon;
  const summary = getStepSummary(step);

  return (
    <div
      className={cn(
        "group max-w-xs mx-auto rounded-lg border bg-card p-3 transition-all cursor-pointer",
        isSelected
          ? "border-primary ring-1 ring-primary/30 shadow-sm"
          : "hover:shadow-sm hover:border-border"
      )}
      onClick={() => selectStep(step.id)}
    >
      <div className="flex items-start gap-3">
        {/* Move up/down buttons */}
        <div className="flex flex-col shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            disabled={isFirst}
            onClick={(e) => {
              e.stopPropagation();
              reorderSteps(index, index - 1);
            }}
            className={cn(
              "p-0.5 rounded transition-colors",
              isFirst
                ? "text-muted-foreground/20 cursor-not-allowed"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={(e) => {
              e.stopPropagation();
              reorderSteps(index, index + 1);
            }}
            className={cn(
              "p-0.5 rounded transition-colors",
              isLast
                ? "text-muted-foreground/20 cursor-not-allowed"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className={cn("flex h-7 w-7 items-center justify-center rounded-md shrink-0 mt-0.5", info.bgColor)}>
          <Icon className={cn("h-3.5 w-3.5", info.color)} />
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
