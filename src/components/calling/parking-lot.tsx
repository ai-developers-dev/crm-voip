"use client";

import { useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Phone, ParkingSquare, Loader2, GripVertical } from "lucide-react";
import { useMemo } from "react";
import { useParkingStore } from "@/lib/stores/parking-store";

interface ParkingLotProps {
  organizationId: Id<"organizations">;
}

export function ParkingLot({ organizationId }: ParkingLotProps) {
  const dbSlots = useQuery(api.parkingLot.getSlots, { organizationId });

  const optimisticCallsMap = useParkingStore((s) => s.optimisticCalls);
  const optimisticCalls = useMemo(() => Object.values(optimisticCallsMap), [optimisticCallsMap]);
  const parkingInProgress = useParkingStore((s) => s.parkingInProgress);

  // Single droppable for entire parking lot
  const { setNodeRef, isOver } = useDroppable({
    id: "parking-lot",
    data: { type: "parking-lot" },
  });

  // Only show occupied slots + optimistic calls (no empty slots)
  const parkedCalls = useMemo(() => {
    const calls: Array<{
      slotNumber: number;
      call: any;
      isOptimistic?: boolean;
    }> = [];

    // Add occupied DB slots
    if (dbSlots) {
      for (const dbSlot of dbSlots) {
        if (dbSlot.isOccupied) {
          calls.push({
            slotNumber: dbSlot.slotNumber,
            call: dbSlot.call || {
              from: dbSlot.callerNumber,
              fromName: dbSlot.callerName,
              conferenceName: dbSlot.conferenceName,
              pstnCallSid: dbSlot.pstnCallSid,
            },
          });
        }
      }
    }

    // Add optimistic calls
    for (const optCall of optimisticCalls) {
      calls.push({
        slotNumber: calls.length + 1,
        isOptimistic: true,
        call: {
          _id: optCall.id,
          twilioCallSid: optCall.twilioCallSid,
          from: optCall.callerNumber,
          fromName: optCall.callerName,
          conferenceName: optCall.conferenceName,
        },
      });
    }

    return calls;
  }, [dbSlots, optimisticCalls]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "p-4 transition-all min-h-full",
        isOver && "ring-2 ring-primary ring-offset-2 bg-primary/5"
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <ParkingSquare className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold">Parking Lot</h2>
        {parkedCalls.length > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">{parkedCalls.length} parked</span>
        )}
        {parkingInProgress && (
          <Loader2 className="h-4 w-4 animate-spin text-primary ml-1" />
        )}
      </div>

      {dbSlots === undefined ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : parkedCalls.length === 0 ? (
        <div className={cn(
          "flex flex-col items-center justify-center py-8 rounded-lg border-2 border-dashed transition-all",
          isOver ? "border-primary bg-primary/5 text-primary" : "border-border/40 text-muted-foreground/40"
        )}>
          <ParkingSquare className="h-8 w-8 mb-2" />
          <p className="text-xs font-medium">
            {isOver ? "Drop to park" : "Drag a call here to park"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {parkedCalls.map((slot) => (
            <ParkedCallCard
              key={slot.call._id || slot.call.twilioCallSid || `slot-${slot.slotNumber}`}
              slotNumber={slot.slotNumber}
              call={slot.call}
              isOptimistic={slot.isOptimistic}
            />
          ))}

          {/* Drop zone when calls are already parked */}
          {isOver && (
            <div className="p-3 rounded-md border-2 border-dashed border-primary bg-primary/10 text-center">
              <p className="text-xs font-medium text-primary">Drop to park call</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ParkedCallCardProps {
  slotNumber: number;
  call: any;
  isOptimistic?: boolean;
}

function ParkedCallCard({ slotNumber, call, isOptimistic }: ParkedCallCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: call?._id || call?.twilioCallSid || `parked-${slotNumber}`,
    data: {
      type: "parked-call",
      call,
      slotNumber,
      twilioCallSid: call?.twilioCallSid,
      pstnCallSid: call?.pstnCallSid,
      conferenceName: call?.conferenceName,
    },
    disabled: !!isOptimistic,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={!isOptimistic ? setNodeRef : undefined}
      style={!isOptimistic ? style : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 transition-all",
        "bg-primary/5 dark:bg-primary/10 border-primary/30",
        !isOptimistic && "cursor-grab active:cursor-grabbing",
        isOptimistic && "opacity-70 animate-pulse",
        isDragging && "ring-2 ring-primary shadow-lg"
      )}
      {...(!isOptimistic ? { ...listeners, ...attributes } : {})}
    >
      {!isOptimistic && (
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      {isOptimistic && (
        <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
      )}

      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-white text-xs font-bold shrink-0">
        {slotNumber}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">
            {call.fromName || call.from || "Unknown"}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {isOptimistic ? "Parking..." : "On hold — drag to agent"}
        </p>
      </div>
    </div>
  );
}
