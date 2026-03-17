"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

interface WorkflowDropZoneProps {
  index: number;
  isActiveDragFromPalette: boolean;
}

export function WorkflowDropZone({ index, isActiveDragFromPalette }: WorkflowDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-zone-${index}`,
    data: { type: "step-drop-zone", index },
  });

  if (!isActiveDragFromPalette) {
    return <div className="h-1" />;
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "mx-auto transition-all duration-200 rounded-lg border-2 border-dashed flex items-center justify-center",
        isOver
          ? "h-14 border-primary bg-primary/5 text-primary"
          : "h-8 border-border/40 text-muted-foreground/40"
      )}
    >
      {isOver && <Plus className="h-4 w-4" />}
    </div>
  );
}
