"use client";

import { useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Phone, ParkingSquare, Loader2, GripVertical } from "lucide-react";
import { useCallback } from "react";

interface ParkingLotProps {
  organizationId: Id<"organizations">;
}

export function ParkingLot({ organizationId }: ParkingLotProps) {
  // Query parking slots from Convex
  const slots = useQuery(api.parkingLot.getSlots, {
    organizationId,
  });

  // If no slots exist yet, show placeholder slots
  // These will be created when first call is parked or admin initializes them
  const displaySlots =
    slots && slots.length > 0
      ? slots
      : Array.from({ length: 10 }, (_, i) => ({
          _id: `placeholder-${i}` as Id<"parkingLots">,
          slotNumber: i + 1,
          isOccupied: false,
          call: null,
          organizationId,
        }));

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <ParkingSquare className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Parking Lot</h2>
      </div>

      {slots === undefined ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {displaySlots.map((slot) => (
            <ParkingSlot
              key={slot.slotNumber}
              slotNumber={slot.slotNumber}
              isOccupied={slot.isOccupied}
              call={slot.call}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ParkingSlotProps {
  slotNumber: number;
  isOccupied: boolean;
  call: any;
}

function ParkingSlot({ slotNumber, isOccupied, call }: ParkingSlotProps) {
  // Droppable hook - accepts calls being dropped into this slot
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `parking-${slotNumber}`,
    data: { type: "parking-slot", slotNumber },
  });

  // Draggable hook - allows parked calls to be dragged out
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    transform,
    isDragging,
  } = useDraggable({
    id: call?._id || `empty-slot-${slotNumber}`,
    data: { type: "parked-call", call, slotNumber },
    disabled: !isOccupied, // Only draggable when occupied
  });

  // Merge refs for both droppable and draggable
  const mergeRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setDroppableRef(node);
      if (isOccupied) {
        setDraggableRef(node);
      }
    },
    [setDroppableRef, setDraggableRef, isOccupied]
  );

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={mergeRefs}
      style={isOccupied ? style : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md border p-3 transition-all",
        isOccupied
          ? "bg-primary/5 dark:bg-primary/10 border-primary/30 cursor-grab active:cursor-grabbing"
          : "bg-background border-dashed",
        isOver && "ring-2 ring-primary ring-offset-2 bg-primary/5",
        isDragging && "ring-2 ring-primary shadow-lg"
      )}
      {...(isOccupied ? { ...listeners, ...attributes } : {})}
    >
      {/* Drag handle indicator for occupied slots */}
      {isOccupied && (
        <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      )}

      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold flex-shrink-0",
          isOccupied
            ? "bg-primary text-white"
            : "bg-muted text-muted-foreground"
        )}
      >
        {slotNumber}
      </div>

      {isOccupied && call ? (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium truncate">
              {call.fromName || call.from}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">On hold</p>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">Empty</span>
      )}
    </div>
  );
}
