"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Phone,
  PhoneOff,
  Pause,
  Play,
  Mic,
  MicOff,
  GripVertical,
} from "lucide-react";
import { useState, useEffect } from "react";

interface ActiveCallCardProps {
  call: {
    _id: string;
    from: string;
    fromName?: string;
    state: string;
    startedAt: number;
    answeredAt?: number;
  };
  compact?: boolean;
}

export function ActiveCallCard({ call, compact = false }: ActiveCallCardProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isHeld, setIsHeld] = useState(call.state === "on_hold");
  const [duration, setDuration] = useState(0);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: call._id,
      data: { type: "call", call },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  // Update duration every second
  useEffect(() => {
    if (!call.answeredAt) return;

    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - call.answeredAt!) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [call.answeredAt]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (compact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "flex items-center gap-2 rounded-md border bg-primary/5 dark:bg-primary/10 p-2 cursor-grab active:cursor-grabbing",
          isDragging && "ring-2 ring-primary"
        )}
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <Phone className="h-4 w-4 text-primary" />
        <span className="flex-1 text-sm font-medium truncate">
          {call.fromName || call.from}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDuration(duration)}
        </span>
      </div>
    );
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-grab active:cursor-grabbing",
        isDragging && "ring-2 ring-primary shadow-lg"
      )}
      {...listeners}
      {...attributes}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{call.fromName || call.from}</p>
              <p className="text-sm text-muted-foreground">
                {call.state === "on_hold" ? "On Hold" : "Connected"} •{" "}
                {formatDuration(duration)}
              </p>
            </div>
          </div>

          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            variant={isMuted ? "destructive" : "secondary"}
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setIsMuted(!isMuted);
            }}
          >
            {isMuted ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant={isHeld ? "default" : "secondary"}
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setIsHeld(!isHeld);
            }}
          >
            {isHeld ? (
              <Play className="h-4 w-4" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="destructive"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              console.log("End call:", call._id);
            }}
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
