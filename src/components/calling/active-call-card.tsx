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
  Focus,
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
  // Multi-call props
  isFocused?: boolean;
  isHeld?: boolean;
  onFocus?: () => void;
  onHold?: () => void;
  onUnhold?: () => void;
  showFocusControls?: boolean;
}

export function ActiveCallCard({
  call,
  activeCall,
  onEndCall,
  compact = false,
  isFocused = true,
  isHeld = false,
  onFocus,
  onHold,
  onUnhold,
  showFocusControls = false,
}: ActiveCallCardProps) {
  const [isMuted, setIsMuted] = useState(false);
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
        isParked: false,
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
      if (isHeld && onUnhold) {
        onUnhold();
      } else if (!isHeld && onHold) {
        onHold();
      }
    },
    [isHeld, onHold, onUnhold]
  );

  const handleFocus = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onFocus) {
        onFocus();
      }
    },
    [onFocus]
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

  // Get status display
  const getStatusDisplay = () => {
    if (isHeld) return "On Hold";
    if (!isFocused) return "Background";
    return "Connected";
  };

  // Compact card for multi-call display
  if (compact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border shadow-sm touch-none select-none max-w-sm transition-all",
          isDragging && "opacity-50 shadow-lg ring-2 ring-primary",
          isHeld
            ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800"
            : isFocused
            ? "bg-white dark:bg-slate-900 border-primary"
            : "bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-gray-700"
        )}
      >
        {/* Drag handle area */}
        <div
          {...listeners}
          {...attributes}
          className="flex items-center gap-2 flex-1 min-w-0 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Phone
            className={cn(
              "h-4 w-4 flex-shrink-0",
              isHeld
                ? "text-yellow-600"
                : isFocused
                ? "text-primary"
                : "text-muted-foreground"
            )}
          />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate">
              {call.fromName || call.from}
            </span>
            {(isHeld || !isFocused) && (
              <span
                className={cn(
                  "text-xs",
                  isHeld ? "text-yellow-600" : "text-muted-foreground"
                )}
              >
                {getStatusDisplay()}
              </span>
            )}
          </div>
        </div>

        {/* Duration */}
        <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
          {formatDuration(duration)}
        </span>

        {/* Focus button (only show if not focused and showFocusControls is true) */}
        {showFocusControls && !isFocused && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0 flex-shrink-0"
            onClick={handleFocus}
            title="Switch to this call"
          >
            <Focus className="h-3.5 w-3.5 text-primary" />
          </Button>
        )}

        {/* Hold button (only for focused calls) */}
        {isFocused && (onHold || onUnhold) && (
          <Button
            variant={isHeld ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 w-7 p-0 flex-shrink-0",
              isHeld && "bg-yellow-500 hover:bg-yellow-600"
            )}
            onClick={handleHoldToggle}
            title={isHeld ? "Resume" : "Hold"}
          >
            {isHeld ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
          </Button>
        )}

        {/* End call button */}
        <Button
          variant="destructive"
          size="sm"
          className="h-7 w-7 p-0 flex-shrink-0"
          onClick={handleEndCall}
          title="End Call"
        >
          <PhoneOff className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // Full card (for single call display)
  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-grab active:cursor-grabbing transition-all",
        isDragging && "ring-2 ring-primary shadow-lg",
        isHeld && "border-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/20",
        !isFocused && !isHeld && "opacity-75"
      )}
      {...listeners}
      {...attributes}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                isHeld
                  ? "bg-yellow-100 dark:bg-yellow-900/30"
                  : "bg-primary/10"
              )}
            >
              <Phone
                className={cn(
                  "h-5 w-5",
                  isHeld ? "text-yellow-600" : "text-primary"
                )}
              />
            </div>
            <div>
              <p className="font-medium">{call.fromName || call.from}</p>
              <p className="text-sm text-muted-foreground">
                {getStatusDisplay()} {"\u2022"} {formatDuration(duration)}
              </p>
            </div>
          </div>

          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          {/* Focus button (for multi-call switching) */}
          {showFocusControls && !isFocused && (
            <Button
              variant="outline"
              size="icon"
              onClick={handleFocus}
              title="Switch to this call"
              className="border-primary text-primary hover:bg-primary/10"
            >
              <Focus className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant={isMuted ? "destructive" : "secondary"}
            size="icon"
            onClick={handleMuteToggle}
            title={isMuted ? "Unmute" : "Mute"}
            disabled={!isFocused || isHeld}
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
            className={cn(isHeld && "bg-yellow-500 hover:bg-yellow-600")}
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
