"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
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
import { useState, useEffect, useCallback } from "react";
import type { Call } from "@twilio/voice-sdk";

interface ActiveCallCardProps {
  call: {
    _id: string;
    twilioCallSid?: string;
    from: string;
    fromName?: string;
    state: string;
    startedAt: number;
    answeredAt?: number;
  };
  activeCall?: Call | null; // Twilio SDK Call object
  onEndCall?: () => void;
  compact?: boolean;
}

export function ActiveCallCard({
  call,
  activeCall,
  onEndCall,
  compact = false,
}: ActiveCallCardProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isHeld, setIsHeld] = useState(call.state === "on_hold");
  const [duration, setDuration] = useState(0);

  // Convex mutation to end call
  const endCallMutation = useMutation(api.calls.end);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: call._id,
      data: {
        type: "call",
        call,
        callObject: activeCall,
        callerId: call.from,
        callerName: call.fromName,
        twilioCallSid: call.twilioCallSid,
        isParked: false, // Explicitly mark as not parked (matches working app)
      },
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

  // Sync mute state with Twilio call
  useEffect(() => {
    if (activeCall) {
      setIsMuted(activeCall.isMuted());
    }
  }, [activeCall]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleMuteToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (activeCall) {
        const newMuted = !activeCall.isMuted();
        activeCall.mute(newMuted);
        setIsMuted(newMuted);
        console.log(`Call ${newMuted ? "muted" : "unmuted"}`);
      }
    },
    [activeCall]
  );

  const handleHoldToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Hold functionality requires Twilio REST API to update call
      // For now, toggle local state - full implementation needs API route
      setIsHeld(!isHeld);
      console.log(`Call ${!isHeld ? "held" : "resumed"}`);
    },
    [isHeld]
  );

  const handleEndCall = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      console.log("Ending call:", call._id);

      // Disconnect Twilio SDK call
      if (activeCall) {
        activeCall.disconnect();
      }

      // Update database
      try {
        await endCallMutation({ callId: call._id as Id<"activeCalls"> });
      } catch (error) {
        console.error("Failed to end call in database:", error);
      }

      // Call parent handler
      if (onEndCall) {
        onEndCall();
      }
    },
    [activeCall, call._id, endCallMutation, onEndCall]
  );

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
                {isHeld ? "On Hold" : "Connected"} • {formatDuration(duration)}
              </p>
            </div>
          </div>

          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            variant={isMuted ? "destructive" : "secondary"}
            size="icon"
            onClick={handleMuteToggle}
            title={isMuted ? "Unmute" : "Mute"}
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
            onClick={handleHoldToggle}
            title={isHeld ? "Resume" : "Hold"}
          >
            {isHeld ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>

          <Button
            variant="destructive"
            size="icon"
            onClick={handleEndCall}
            title="End Call"
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
