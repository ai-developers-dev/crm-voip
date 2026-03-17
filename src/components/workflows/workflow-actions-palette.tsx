"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { stepTypeInfo, type StepType } from "./workflow-step-card";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";

const actionTypes = Object.entries(stepTypeInfo) as [StepType, typeof stepTypeInfo[StepType]][];

function DraggableActionTile({ type, info }: { type: StepType; info: typeof stepTypeInfo[StepType] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { type: "palette-action", stepType: type },
  });

  const Icon = info.icon;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border bg-card p-2.5 cursor-grab active:cursor-grabbing transition-all",
        isDragging
          ? "opacity-40 shadow-lg ring-2 ring-primary/30"
          : "hover:shadow-sm hover:border-primary/30"
      )}
    >
      <div className={cn("flex h-7 w-7 items-center justify-center rounded-md shrink-0", info.bgColor)}>
        <Icon className={cn("h-3.5 w-3.5", info.color)} />
      </div>
      <span className="text-xs font-medium flex-1">{info.label}</span>
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
    </div>
  );
}

export function WorkflowActionsPalette() {
  return (
    <div className="p-4 space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-1">Actions</h3>
        <p className="text-[11px] text-muted-foreground">
          Drag an action onto the canvas to add a step
        </p>
      </div>
      <div className="space-y-1.5">
        {actionTypes.map(([type, info]) => (
          <DraggableActionTile key={type} type={type} info={info} />
        ))}
      </div>
    </div>
  );
}
