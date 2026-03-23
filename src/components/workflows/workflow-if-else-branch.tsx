"use client";

import { useState } from "react";
import { stepTypeInfo, getStepSummary, type WorkflowStep, type StepType, type BranchDef, normalizeBranches } from "./workflow-step-card";
import { useCanvasContext } from "./workflow-canvas-provider";
import { cn } from "@/lib/utils";
import {
  ArrowDown, ChevronUp, ChevronDown, GitBranch, Plus, Trash2, PlusCircle,
} from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

// ---------------------------------------------------------------------------
// Branch Step Card (simplified — click to select, no drag reorder)
// ---------------------------------------------------------------------------
function BranchStepCard({
  step,
  parentStepId,
  branchId,
  index,
  totalSteps,
}: {
  step: WorkflowStep;
  parentStepId: string;
  branchId: string;
  index: number;
  totalSteps: number;
}) {
  const { selectStep, removeBranchStep, reorderBranchSteps } = useCanvasContext();
  const info = stepTypeInfo[step.type];

  if (!info) return null;
  const Icon = info.icon;

  // Nested if/else inside a branch
  if (step.type === "if_else") {
    return (
      <NestedIfElse step={step} parentStepId={parentStepId} branchId={branchId} />
    );
  }

  const summary = getStepSummary(step);
  const isFirst = index === 0;
  const isLast = index === totalSteps - 1;

  return (
    <div
      className="group w-full rounded-lg border bg-card p-3 hover:shadow-sm transition-shadow cursor-pointer relative"
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
              reorderBranchSteps(parentStepId, branchId, index, index - 1);
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
              reorderBranchSteps(parentStepId, branchId, index, index + 1);
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
        <div className="flex-1 min-w-0 pt-0.5">
          <span className="text-sm font-medium">{info.label}</span>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{summary}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            removeBranchStep(parentStepId, branchId, step.id);
          }}
          className="p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nested If/Else (recursive rendering)
// ---------------------------------------------------------------------------
function NestedIfElse({
  step,
  parentStepId,
  branchId,
}: {
  step: WorkflowStep;
  parentStepId: string;
  branchId: string;
}) {
  const { selectStep, removeBranchStep } = useCanvasContext();
  const info = stepTypeInfo.if_else;
  const Icon = info.icon;

  const branches = normalizeBranches(step.config);
  const namedBranches = branches.filter(b => !b.isDefault);
  const defaultBranch = branches.find(b => b.isDefault);

  return (
    <div className="w-full">
      {/* Nested if/else card */}
      <div
        className="group w-full rounded-lg border border-yellow-300/50 bg-yellow-50/30 dark:bg-yellow-900/10 p-2.5 hover:shadow-sm cursor-pointer relative"
        onClick={() => selectStep(step.id)}
      >
        <div className="flex items-center gap-2">
          <div className={cn("flex h-6 w-6 items-center justify-center rounded-md shrink-0", info.bgColor)}>
            <Icon className={cn("h-3 w-3", info.color)} />
          </div>
          <span className="text-xs font-medium truncate flex-1">{info.label}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeBranchStep(parentStepId, branchId, step.id);
            }}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Nested branches (simplified — just show counts) */}
      <div className="flex gap-2 mt-1.5 ml-2 flex-wrap">
        {namedBranches.map((b) => (
          <span key={b.id} className="text-[10px] text-primary">
            {b.name}: {b.steps.length} step{b.steps.length !== 1 ? "s" : ""}
          </span>
        ))}
        {defaultBranch && (
          <span className="text-[10px] text-muted-foreground">
            None: {defaultBranch.steps.length} step{defaultBranch.steps.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Step Popover (for adding steps to branches)
// ---------------------------------------------------------------------------
function AddStepToBranch({
  parentStepId,
  branchId,
}: {
  parentStepId: string;
  branchId: string;
}) {
  const { insertBranchStep } = useCanvasContext();
  const [open, setOpen] = useState(false);

  const actionTypes = Object.entries(stepTypeInfo) as [StepType, typeof stepTypeInfo[StepType]][];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border/60 text-muted-foreground/50 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1.5" align="start">
        <div className="space-y-0.5">
          {actionTypes.map(([type, info]) => {
            const Icon = info.icon;
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  insertBranchStep(parentStepId, branchId, type);
                  setOpen(false);
                }}
                className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors text-left"
              >
                <div className={cn("flex h-5 w-5 items-center justify-center rounded shrink-0", info.bgColor)}>
                  <Icon className={cn("h-3 w-3", info.color)} />
                </div>
                <span>{info.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Branch Column
// ---------------------------------------------------------------------------
function BranchColumn({
  branch,
  parentStepId,
  isDefault,
}: {
  branch: BranchDef;
  parentStepId: string;
  isDefault?: boolean;
}) {
  const condCount = branch.conditions?.length || 0;
  const condSummary = isDefault
    ? "When none of the conditions are met"
    : condCount === 0
      ? "No conditions set"
      : `${condCount} condition${condCount !== 1 ? "s" : ""} (${(branch.conditionLogic || "and").toUpperCase()})`;

  return (
    <div className="flex flex-col items-center w-full max-w-xs">
      {/* Vertical connector from horizontal line */}
      <div className="w-px h-3 bg-border" />

      {/* Branch label */}
      <div
        className={cn(
          "text-[10px] font-bold px-2.5 py-1 rounded-full mb-1 border text-center max-w-full",
          isDefault
            ? "text-muted-foreground bg-muted/50 border-border/60"
            : "text-primary bg-primary/5 border-primary/20"
        )}
      >
        <GitBranch className="h-2.5 w-2.5 inline-block mr-1 -mt-px" />
        {branch.name}
      </div>

      {/* Condition summary */}
      <p className="text-[9px] text-muted-foreground mb-2 text-center px-1 line-clamp-2">
        {condSummary}
      </p>

      {/* Steps in this branch */}
      <div className="w-full">
        {/* Vertical line from branch label to first step / add button */}
        <div className="flex justify-center">
          <div className="w-px h-3 bg-border" />
        </div>

        {branch.steps.map((branchStep, i) => (
          <div key={`${branch.id}-${branchStep.id}-${i}`}>
            <BranchStepCard step={branchStep} parentStepId={parentStepId} branchId={branch.id} index={i} totalSteps={branch.steps.length} />
            {/* Connector to next step or to add button */}
            <div className="flex justify-center py-1">
              <div className="flex flex-col items-center">
                <div className="w-px h-2 bg-border" />
                <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/40" />
              </div>
            </div>
          </div>
        ))}

        <div className="flex justify-center">
          <AddStepToBranch parentStepId={parentStepId} branchId={branch.id} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main If/Else Branch View
// ---------------------------------------------------------------------------
export function IfElseBranchView({
  step,
}: {
  step: WorkflowStep;
}) {
  const { selectStep, selectedStepId, addBranch } = useCanvasContext();
  const info = stepTypeInfo.if_else;
  const Icon = info.icon;

  const branches = normalizeBranches(step.config);
  const namedBranches = branches.filter(b => !b.isDefault);
  const defaultBranch = branches.find(b => b.isDefault);

  const totalConditions = namedBranches.reduce((sum, b) => sum + (b.conditions?.length || 0), 0);
  const summary = namedBranches.length === 0
    ? "No branches set"
    : totalConditions === 0
      ? `${namedBranches.length} branch${namedBranches.length !== 1 ? "es" : ""} — no conditions`
      : `${namedBranches.length} branch${namedBranches.length !== 1 ? "es" : ""}, ${totalConditions} condition${totalConditions !== 1 ? "s" : ""}`;

  const isSelected = selectedStepId === step.id;

  return (
    <div className="w-full">
      {/* Condition card — centered, same width as other step cards */}
      <div className="max-w-xs mx-auto">
        <div
          className={cn(
            "rounded-lg border bg-card p-3 hover:shadow-sm transition-all cursor-pointer",
            isSelected
              ? "border-primary ring-1 ring-primary/30 shadow-sm"
              : "hover:border-border"
          )}
          onClick={() => selectStep(step.id)}
        >
          <div className="flex items-start gap-3">
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-md shrink-0 mt-0.5", info.bgColor)}>
              <Icon className={cn("h-3.5 w-3.5", info.color)} />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <span className="text-sm font-medium">Condition</span>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{summary}</p>
            </div>
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all" />
          </div>
        </div>
      </div>

      {/* Branch split connector — arrow from condition card to branches */}
      <div className="flex justify-center py-1">
        <div className="flex flex-col items-center">
          <div className="w-px h-2 bg-border" />
          <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/40" />
        </div>
      </div>

      {/* All branches side by side */}
      <div className="relative">
        {/* Horizontal connector line across all columns */}
        <div
          className="absolute top-0 h-px bg-border"
          style={{
            left: `${100 / (branches.length * 2)}%`,
            right: `${100 / (branches.length * 2)}%`,
          }}
        />

        <div className="flex gap-6 justify-center overflow-x-auto">
          {/* Named branches */}
          {namedBranches.map((branch) => (
            <div key={branch.id} className="flex-1">
              <BranchColumn
                branch={branch}
                parentStepId={step.id}
              />
            </div>
          ))}

          {/* "None" (default) branch — always last */}
          {defaultBranch && (
            <div className="flex-1">
              <BranchColumn
                branch={defaultBranch}
                parentStepId={step.id}
                isDefault
              />
            </div>
          )}
        </div>

        {/* Add Branch button below branches */}
        {namedBranches.length < 10 && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                addBranch(step.id);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-primary/30 text-primary/60 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors text-[10px]"
            >
              <PlusCircle className="h-3 w-3" />
              Add Branch
            </button>
          </div>
        )}

        {/* Merge connector at bottom */}
        <div className="flex justify-center pt-2">
          <div className="relative" style={{ width: `${Math.max(50, 100 - 100 / branches.length)}%` }}>
            <div className="absolute top-0 left-0 right-0 h-px bg-border" />
            <div className="absolute top-0 left-1/2 w-px h-3 bg-border -translate-x-px" />
          </div>
        </div>
      </div>
    </div>
  );
}
