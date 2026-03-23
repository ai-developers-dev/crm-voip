"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { WorkflowCanvasProvider, useCanvasContext } from "./workflow-canvas-provider";
import { WorkflowCanvasHeader } from "./workflow-canvas-header";
import { WorkflowStepFlow } from "./workflow-step-flow";
import { WorkflowActionsPalette } from "./workflow-actions-palette";
import { WorkflowStepDetailPanel } from "./workflow-step-detail-panel";
import { WorkflowActivityPanel } from "./workflow-activity-panel";
import { stepTypeInfo, type StepType, type WorkflowStep } from "./workflow-step-card";
import type { TriggerType, TriggerConfig } from "./workflow-trigger-select";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";

interface WorkflowCanvasProps {
  workflow?: Doc<"workflows">;
  organizationId: Id<"organizations">;
  /** Base path for navigation (e.g., "/workflows" or "/admin/tenants/[id]/workflows") */
  basePath?: string;
}

export function WorkflowCanvas({ workflow, organizationId, basePath = "/workflows" }: WorkflowCanvasProps) {
  return (
    <WorkflowCanvasProvider
      organizationId={organizationId}
      initialName={workflow?.name}
      initialTriggerType={workflow?.triggerType as TriggerType | undefined}
      initialTriggerConfig={workflow?.triggerConfig as TriggerConfig | undefined}
      initialSteps={workflow?.steps as WorkflowStep[] | undefined}
      initialIsActive={workflow?.isActive}
    >
      <CanvasInner workflowId={workflow?._id} basePath={basePath} />
    </WorkflowCanvasProvider>
  );
}

function CanvasInner({ workflowId, basePath = "/workflows" }: { workflowId?: Id<"workflows">; basePath?: string }) {
  const { steps, insertStep, reorderSteps, reorderBranchSteps, rightPanelMode, setRightPanelMode } = useCanvasContext();
  const [activeDrag, setActiveDrag] = useState<{ type: string; stepType?: StepType; step?: WorkflowStep } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const isActiveDragFromPalette = activeDrag?.type === "palette-action";

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === "palette-action") {
      setActiveDrag({ type: "palette-action", stepType: data.stepType as StepType });
    } else if (data?.type === "canvas-step") {
      setActiveDrag({ type: "canvas-step", step: data.step as WorkflowStep });
    } else if (data?.type === "branch-step") {
      setActiveDrag({ type: "branch-step", step: data.step as WorkflowStep });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDrag(null);

    if (!over) return;

    const activeType = active.data.current?.type;

    if (activeType === "palette-action" && over.data.current?.type === "step-drop-zone") {
      const stepType = active.data.current!.stepType as StepType;
      const index = over.data.current!.index as number;
      insertStep(stepType, index);
    } else if (activeType === "canvas-step") {
      const oldIndex = active.data.current!.index as number;
      let newIndex: number;
      if (over.data.current?.type === "canvas-step") {
        newIndex = over.data.current.index as number;
      } else if (over.data.current?.type === "step-drop-zone") {
        newIndex = over.data.current.index as number;
        if (newIndex > oldIndex) newIndex--;
      } else {
        return;
      }
      if (oldIndex !== newIndex) {
        reorderSteps(oldIndex, newIndex);
      }
    } else if (activeType === "branch-step" && over.data.current?.type === "branch-step") {
      // Reorder within the same branch
      const activeData = active.data.current!;
      const overData = over.data.current!;
      if (activeData.parentStepId === overData.parentStepId && activeData.branchId === overData.branchId) {
        const oldIndex = activeData.index as number;
        const newIndex = overData.index as number;
        if (oldIndex !== newIndex) {
          reorderBranchSteps(activeData.parentStepId, activeData.branchId, oldIndex, newIndex);
        }
      }
    }
  }

  function handleDragCancel() {
    setActiveDrag(null);
  }

  // Drag overlay content
  let overlayContent = null;
  if (activeDrag?.type === "palette-action" && activeDrag.stepType) {
    const info = stepTypeInfo[activeDrag.stepType];
    const Icon = info.icon;
    overlayContent = (
      <div className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5 shadow-lg w-56">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-md shrink-0", info.bgColor)}>
          <Icon className={cn("h-3.5 w-3.5", info.color)} />
        </div>
        <span className="text-xs font-medium">{info.label}</span>
      </div>
    );
  } else if ((activeDrag?.type === "canvas-step" || activeDrag?.type === "branch-step") && activeDrag.step) {
    const info = stepTypeInfo[activeDrag.step.type];
    const Icon = info.icon;
    overlayContent = (
      <div className="flex items-center gap-2.5 rounded-lg border bg-card p-3 shadow-lg w-64">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-md shrink-0", info.bgColor)}>
          <Icon className={cn("h-3.5 w-3.5", info.color)} />
        </div>
        <span className="text-sm font-medium">{info.label}</span>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col" style={{ height: "calc(100vh - var(--header-height, 3.5rem))" }}>
        <WorkflowCanvasHeader workflowId={workflowId} basePath={basePath} />

        <div className="flex flex-1 min-h-0">
          {/* Left: Step flow canvas */}
          <WorkflowStepFlow isActiveDragFromPalette={isActiveDragFromPalette} />

          {/* Right: Panel */}
          <div className="w-80 border-l bg-background flex flex-col shrink-0">
            {/* Panel tab switcher */}
            {workflowId && (
              <div className="flex border-b shrink-0">
                <button
                  onClick={() => setRightPanelMode(rightPanelMode === "activity" ? "palette" : rightPanelMode)}
                  className={cn(
                    "flex-1 px-3 py-2 text-xs font-medium transition-colors",
                    rightPanelMode !== "activity"
                      ? "text-foreground border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Actions
                </button>
                <button
                  onClick={() => setRightPanelMode("activity")}
                  className={cn(
                    "flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5",
                    rightPanelMode === "activity"
                      ? "text-foreground border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Users className="h-3 w-3" />
                  Activity
                </button>
              </div>
            )}

            {/* Panel content */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {rightPanelMode === "activity" && workflowId ? (
                <WorkflowActivityPanel workflowId={workflowId} />
              ) : rightPanelMode === "step-detail" ? (
                <WorkflowStepDetailPanel />
              ) : (
                <WorkflowActionsPalette />
              )}
            </div>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {overlayContent}
      </DragOverlay>
    </DndContext>
  );
}
