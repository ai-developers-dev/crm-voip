"use client";

import { useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { useCanvasContext } from "./workflow-canvas-provider";
import { WorkflowCanvasStepCard } from "./workflow-canvas-step-card";
import { WorkflowDropZone } from "./workflow-drop-zone";
import { WorkflowTriggerSelect, triggerOptions } from "./workflow-trigger-select";
import { IfElseBranchView } from "./workflow-if-else-branch";
import { Input } from "@/components/ui/input";
import { Workflow, ArrowDown, Zap, ChevronDown } from "lucide-react";

interface WorkflowStepFlowProps {
  isActiveDragFromPalette: boolean;
}

export function WorkflowStepFlow({ isActiveDragFromPalette }: WorkflowStepFlowProps) {
  const { steps, selectStep, name, setName, triggerType, setTriggerType, triggerConfig, setTriggerConfig, organizationId } = useCanvasContext();
  const [triggerExpanded, setTriggerExpanded] = useState(false);
  const triggerLabel = triggerOptions.find((t) => t.value === triggerType)?.label ?? triggerType;

  const sortableIds = steps.map((s) => `step-${s.id}`);

  // Empty state drop zone
  const { setNodeRef: emptyRef, isOver: emptyIsOver } = useDroppable({
    id: "drop-zone-0-empty",
    data: { type: "step-drop-zone", index: 0 },
  });

  if (steps.length === 0) {
    return (
      <div
        className="flex-1 flex items-center justify-center p-8"
        onClick={() => selectStep(null)}
      >
        <div
          ref={emptyRef}
          className={`flex flex-col items-center justify-center w-full max-w-sm py-16 rounded-xl border-2 border-dashed transition-all ${
            emptyIsOver
              ? "border-primary bg-primary/5 text-primary"
              : isActiveDragFromPalette
                ? "border-primary/40 text-on-surface-variant animate-pulse"
                : "border-border/40 text-on-surface-variant/40"
          }`}
        >
          <Workflow className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium">
            {isActiveDragFromPalette ? "Drop here to add first step" : "Drag an action here to start"}
          </p>
          <p className="text-xs mt-1 text-on-surface-variant">
            Build your workflow by dragging actions from the right panel
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) selectStep(null);
      }}
    >
      <div className="max-w-2xl mx-auto">
        {/* Workflow name */}
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workflow name..."
          className="h-9 text-sm font-semibold mb-4 border-transparent hover:border-border focus:border-border max-w-xs mx-auto block"
        />

        {/* Trigger — collapsible */}
        <div className="max-w-xs mx-auto rounded-lg border bg-card mb-4">
          <button
            type="button"
            onClick={() => setTriggerExpanded(!triggerExpanded)}
            className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-surface-container/30 transition-colors rounded-lg"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-100 dark:bg-cyan-900/30 shrink-0">
              <Zap className="h-3.5 w-3.5 text-cyan-600" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-foreground">Trigger</span>
              <p className="text-[11px] text-on-surface-variant truncate">{triggerLabel}</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-on-surface-variant transition-transform ${triggerExpanded ? "rotate-180" : ""}`} />
          </button>
          <div className={`overflow-hidden transition-all duration-200 ${triggerExpanded ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"}`}>
            <div className="px-3 pb-3 pt-1">
              <WorkflowTriggerSelect
                triggerType={triggerType}
                triggerConfig={triggerConfig}
                organizationId={organizationId}
                onTriggerTypeChange={setTriggerType}
                onTriggerConfigChange={setTriggerConfig}
              />
            </div>
          </div>
        </div>

        {/* Arrow from trigger to steps */}
        <div className="flex justify-center pb-2">
          <div className="flex flex-col items-center">
            <div className="w-px h-2 bg-border" />
            <ArrowDown className="h-3.5 w-3.5 text-on-surface-variant/50" />
          </div>
        </div>

        {/* Steps header */}
        <div className="mb-3 text-center">
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
            Then do this ({steps.length} step{steps.length !== 1 ? "s" : ""})
          </h3>
        </div>

        <WorkflowDropZone index={0} isActiveDragFromPalette={isActiveDragFromPalette} />

        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {steps.map((step, i) => {
            // A condition (if_else) is always the last rendered step —
            // all subsequent steps live inside its branches
            const isCondition = step.type === "if_else";
            const nextIsCondition = i < steps.length - 1 && steps[i + 1]?.type === "if_else";

            return (
              <div key={step.id}>
                {isCondition ? (
                  <IfElseBranchView step={step} />
                ) : (
                  <WorkflowCanvasStepCard step={step} index={i} />
                )}

                {/* Don't show connectors or drop zones after a condition step */}
                {!isCondition && (
                  <>
                    {/* Arrow connector */}
                    {i < steps.length - 1 && (
                      <div className="flex justify-center py-1">
                        <div className="flex flex-col items-center">
                          <div className="w-px h-2 bg-border" />
                          <ArrowDown className="h-3.5 w-3.5 text-on-surface-variant/50" />
                          <div className="w-px h-1 bg-border" />
                        </div>
                      </div>
                    )}
                    {/* Don't show drop zone if the next step is a condition (steps go inside it) */}
                    {!nextIsCondition && (
                      <WorkflowDropZone
                        index={i + 1}
                        isActiveDragFromPalette={isActiveDragFromPalette}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </SortableContext>

        {/* End marker — only if last step is not a condition */}
        {steps.length > 0 && steps[steps.length - 1]?.type !== "if_else" && (
          <div className="flex justify-center pt-3 pb-6">
            <div className="flex items-center gap-2 text-xs text-on-surface-variant/50">
              <div className="w-8 border-t border-border/40" />
              <span>End</span>
              <div className="w-8 border-t border-border/40" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
