"use client";

import { useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Phone, ParkingSquare, Loader2, GripVertical } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useParkingStore } from "@/lib/stores/parking-store";

interface ParkingLotProps {
  organizationId: Id<"organizations">;
}

export function ParkingLot({ organizationId }: ParkingLotProps) {
  // Query parking slots from Convex
  const dbSlots = useQuery(api.parkingLot.getSlots, {
    organizationId,
  });

  // Get optimistic calls from Zustand store
  // Select the raw object to avoid creating new array references on every render
  const optimisticCallsMap = useParkingStore((s) => s.optimisticCalls);
  const optimisticCalls = useMemo(() => Object.values(optimisticCallsMap), [optimisticCallsMap]);
  const parkingInProgress = useParkingStore((s) => s.parkingInProgress);

  // Single droppable for entire parking lot (not per-slot)
  const { setNodeRef, isOver } = useDroppable({
    id: "parking-lot",
    data: { type: "parking-lot" },
  });

  // Merge DB slots with optimistic calls
  const displaySlots = useMemo(() => {
    // Start with empty slots
    const slots: Array<{
      slotNumber: number;
      isOccupied: boolean;
      call: any;
      isOptimistic?: boolean;
    }> = Array.from({ length: 10 }, (_, i) => ({
      slotNumber: i + 1,
      isOccupied: false,
      call: null,
    }));

    // Fill in from DB
    if (dbSlots) {
      for (const dbSlot of dbSlots) {
        const idx = dbSlot.slotNumber - 1;
        if (idx >= 0 && idx < 10) {
          slots[idx] = {
            slotNumber: dbSlot.slotNumber,
            isOccupied: dbSlot.isOccupied,
            call: dbSlot.call || {
              from: dbSlot.callerNumber,
              fromName: dbSlot.callerName,
              conferenceName: dbSlot.conferenceName,
            },
          };
        }
      }
    }

    // Add optimistic calls to first available slots
    for (const optCall of optimisticCalls) {
      // Find first empty slot
      const emptyIdx = slots.findIndex((s) => !s.isOccupied);
      if (emptyIdx >= 0) {
        slots[emptyIdx] = {
          slotNumber: emptyIdx + 1,
          isOccupied: true,
          isOptimistic: true,
          call: {
            _id: optCall.id,
            twilioCallSid: optCall.twilioCallSid,
            from: optCall.callerNumber,
            fromName: optCall.callerName,
            conferenceName: optCall.conferenceName,
          },
        };
      }
    }

    return slots;
  }, [dbSlots, optimisticCalls]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "p-4 transition-all rounded-lg",
        isOver && "ring-2 ring-primary ring-offset-2 bg-primary/5"
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <ParkingSquare className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Parking Lot</h2>
        {parkingInProgress && (
          <Loader2 className="h-4 w-4 animate-spin text-primary ml-auto" />
        )}
      </div>

      {dbSlots === undefined ? (
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
              isOptimistic={slot.isOptimistic}
            />
          ))}
        </div>
      )}

      {/* Drop zone indicator when dragging over */}
      {isOver && (
        <div className="mt-3 p-3 rounded-md border-2 border-dashed border-primary bg-primary/10 text-center">
          <p className="text-sm font-medium text-primary">Drop to park call</p>
        </div>
      )}
    </div>
  );
}

interface ParkingSlotProps {
  slotNumber: number;
  isOccupied: boolean;
  call: any;
  isOptimistic?: boolean;
}

function ParkingSlot({ slotNumber, isOccupied, call, isOptimistic }: ParkingSlotProps) {
  // Draggable hook - allows parked calls to be dragged out for transfer
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: call?._id || call?.twilioCallSid || `empty-slot-${slotNumber}`,
    data: {
      type: "parked-call",
      call,
      slotNumber,
      twilioCallSid: call?.twilioCallSid,
      conferenceName: call?.conferenceName,
    },
    disabled: !isOccupied || isOptimistic, // Can't drag optimistic (still saving)
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={isOccupied && !isOptimistic ? setNodeRef : undefined}
      style={isOccupied && !isOptimistic ? style : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md border p-3 transition-all",
        isOccupied
          ? "bg-primary/5 dark:bg-primary/10 border-primary/30"
          : "bg-background border-dashed",
        isOccupied && !isOptimistic && "cursor-grab active:cursor-grabbing",
        isOptimistic && "opacity-70 animate-pulse",
        isDragging && "ring-2 ring-primary shadow-lg"
      )}
      {...(isOccupied && !isOptimistic ? { ...listeners, ...attributes } : {})}
    >
      {/* Drag handle indicator for occupied slots */}
      {isOccupied && !isOptimistic && (
        <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      )}

      {/* Loading spinner for optimistic slots */}
      {isOptimistic && (
        <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />
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
              {call.fromName || call.from || "Unknown"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {isOptimistic ? "Parking..." : "On hold"}
          </p>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">Empty</span>
      )}
    </div>
  );
}
