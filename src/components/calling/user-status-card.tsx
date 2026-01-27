"use client";

import { useDroppable } from "@dnd-kit/core";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Phone, Clock, PhoneCall, PhoneOff, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import { ActiveCallCard } from "./active-call-card";
import { Id } from "../../../convex/_generated/dataModel";
import { useState, useEffect, useCallback } from "react";
import type { CallInfo } from "@/hooks/use-twilio-device";

interface UserStatusCardProps {
  user: {
    id: string;
    clerkUserId: string;
    name: string;
    status: string;
    avatarUrl?: string | null;
  };
  todayMetrics?: {
    callsAccepted: number;
    talkTimeSeconds: number;
    inboundCallsAccepted: number;
    outboundCallsMade: number;
  };
  activeCalls: any[];
  // Legacy single call interface
  twilioActiveCall?: any;
  onHangUp?: () => void;
  onToggleMute?: () => boolean;
  onAnswerTwilio?: () => void;
  onRejectTwilio?: () => void;
  // Multi-call interface
  twilioCallsArray?: CallInfo[];
  focusedCallSid?: string | null;
  onFocusCall?: (callSid: string) => void;
  onHoldCall?: (callSid: string) => Promise<boolean>;
  onUnholdCall?: (callSid: string) => Promise<boolean>;
  onHangUpBySid?: (callSid: string) => void;
  onAnswerCallBySid?: (callSid: string, holdOthers?: boolean) => Promise<boolean>;
  onRejectCallBySid?: (callSid: string) => void;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; dotColor: string }> = {
  available: {
    label: "Available",
    color: "text-purple-600",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    dotColor: "bg-purple-500",
  },
  busy: {
    label: "Busy",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    dotColor: "bg-yellow-500",
  },
  on_call: {
    label: "On Call",
    color: "text-primary",
    bgColor: "bg-primary/10",
    dotColor: "bg-primary",
  },
  on_break: {
    label: "On Break",
    color: "text-orange-600",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    dotColor: "bg-orange-500",
  },
  offline: {
    label: "Offline",
    color: "text-gray-500",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
    dotColor: "bg-gray-400",
  },
};

export function UserStatusCard({
  user,
  todayMetrics,
  activeCalls,
  twilioActiveCall,
  onHangUp,
  onToggleMute,
  onAnswerTwilio,
  onRejectTwilio,
  // Multi-call props
  twilioCallsArray,
  focusedCallSid,
  onFocusCall,
  onHoldCall,
  onUnholdCall,
  onHangUpBySid,
  onAnswerCallBySid,
  onRejectCallBySid,
}: UserStatusCardProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `user-${user.id}`,
    data: { type: "user", user },
  });

  const toggleStatus = useMutation(api.users.toggleStatus);
  const acceptTargetedCall = useMutation(api.targetedRinging.accept);
  const declineTargetedCall = useMutation(api.targetedRinging.decline);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [ringTime, setRingTime] = useState(0);

  // Query for targeted ringing for THIS user specifically
  const targetedRinging = useQuery(
    api.targetedRinging.getForUser,
    { userId: user.id as Id<"users"> }
  );

  // Debug: Log when targetedRinging changes
  useEffect(() => {
    if (targetedRinging !== undefined) {
      console.log(`🎯 UserStatusCard [${user.name}] targetedRinging:`, targetedRinging, "userId:", user.id);
    }
  }, [targetedRinging, user.name, user.id]);

  // Determine if we're in multi-call mode
  const isMultiCallMode = !!twilioCallsArray;

  // Get active (connected) calls from the multi-call array
  const connectedCalls = isMultiCallMode
    ? twilioCallsArray.filter(c => c.status === "open")
    : [];

  // Get pending (ringing) calls from the multi-call array
  const pendingCalls = isMultiCallMode
    ? twilioCallsArray.filter(c => c.status === "pending" && c.direction === "INCOMING")
    : [];

  // Legacy: Check if the Twilio call is connected (not pending/ringing)
  const twilioCallConnected = !isMultiCallMode && twilioActiveCall &&
    twilioActiveCall.status &&
    (twilioActiveCall.status() === "open" || twilioActiveCall.status() === "connecting");

  // Legacy: Check if Twilio call is pending (ringing) for this user
  const twilioCallPending = !isMultiCallMode && twilioActiveCall &&
    twilioActiveCall.direction === "INCOMING" &&
    twilioActiveCall.status &&
    twilioActiveCall.status() === "pending";

  // Update ring time counter for targeted calls
  useEffect(() => {
    if (!targetedRinging) {
      setRingTime(0);
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - targetedRinging.createdAt) / 1000);
      setRingTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [targetedRinging]);

  // Handle accepting targeted call
  const handleAcceptTargeted = useCallback(async () => {
    if (!targetedRinging) return;

    // Need at least one answer method
    if (!onAnswerCallBySid && !onAnswerTwilio) return;

    console.log("Accepting targeted call:", targetedRinging.callerNumber, "agentCallSid:", targetedRinging.agentCallSid);

    // Mark as accepted in database
    await acceptTargetedCall({ id: targetedRinging._id });

    // Answer the Twilio call - prefer multi-call method with specific callSid
    if (onAnswerCallBySid && targetedRinging.agentCallSid) {
      await onAnswerCallBySid(targetedRinging.agentCallSid, true);
    } else if (onAnswerCallBySid && pendingCalls.length > 0) {
      // Fall back to first pending call if agentCallSid not set yet
      await onAnswerCallBySid(pendingCalls[0].callSid, true);
    } else if (onAnswerTwilio) {
      // Legacy single-call fallback
      onAnswerTwilio();
    }
  }, [targetedRinging, onAnswerCallBySid, onAnswerTwilio, acceptTargetedCall, pendingCalls]);

  // Handle declining targeted call
  const handleDeclineTargeted = useCallback(async () => {
    if (!targetedRinging) return;

    // Need at least one reject method
    if (!onRejectCallBySid && !onRejectTwilio) return;

    console.log("Declining targeted call:", targetedRinging.callerNumber, "agentCallSid:", targetedRinging.agentCallSid);

    // Mark as declined in database
    await declineTargetedCall({ id: targetedRinging._id });

    // Reject the Twilio call - prefer multi-call method with specific callSid
    if (onRejectCallBySid && targetedRinging.agentCallSid) {
      onRejectCallBySid(targetedRinging.agentCallSid);
    } else if (onRejectCallBySid && pendingCalls.length > 0) {
      // Fall back to first pending call if agentCallSid not set yet
      onRejectCallBySid(pendingCalls[0].callSid);
    } else if (onRejectTwilio) {
      // Legacy single-call fallback
      onRejectTwilio();
    }
  }, [targetedRinging, onRejectCallBySid, onRejectTwilio, declineTargetedCall, pendingCalls]);

  // Track call start time when call connects
  useEffect(() => {
    if (twilioCallConnected && !callStartTime) {
      setCallStartTime(Date.now());
    } else if (!twilioCallConnected && connectedCalls.length === 0) {
      setCallStartTime(null);
    }
  }, [twilioCallConnected, callStartTime, connectedCalls.length]);

  // Format talk time for display (Xh Xm or Xm)
  const formatTalkTime = (seconds: number) => {
    if (seconds === 0) return "0m";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const status = statusConfig[user.status] || statusConfig.offline;
  const hasActiveCalls = activeCalls.length > 0 || twilioCallConnected || connectedCalls.length > 0;
  const totalCallCount = isMultiCallMode ? connectedCalls.length : (twilioCallConnected ? 1 : 0);

  const handleToggleStatus = async () => {
    try {
      await toggleStatus({ userId: user.id as Id<"users"> });
    } catch (error) {
      console.error("Failed to toggle status:", error);
    }
  };

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "transition-all duration-200",
        isOver && "ring-2 ring-primary ring-offset-2",
        user.status === "offline" && "opacity-60",
        hasActiveCalls && "border-primary border-2"
      )}
    >
      <CardContent className="p-3">
        {/* Main horizontal bar layout */}
        <div className="flex items-center gap-3">
          {/* Avatar with status dot */}
          <div className="relative flex-shrink-0">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user.avatarUrl || undefined} />
              <AvatarFallback className={cn("text-sm", status.bgColor)}>
                {user.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
                status.dotColor
              )}
            />
          </div>

          {/* Name and status */}
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate text-sm">{user.name}</p>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={cn("text-xs px-1.5 py-0", status.bgColor, status.color)}
              >
                {status.label}
              </Badge>
              {/* Show call count badge if multiple calls */}
              {totalCallCount > 1 && (
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  {totalCallCount} calls
                </Badge>
              )}
            </div>
          </div>

          {/* Daily metrics */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1" title="Inbound calls accepted today">
              <PhoneIncoming className="h-4 w-4 text-purple-600" />
              <span className="font-medium tabular-nums">
                {todayMetrics?.inboundCallsAccepted ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-1" title="Outbound calls made today">
              <PhoneOutgoing className="h-4 w-4 text-indigo-600" />
              <span className="font-medium tabular-nums">
                {todayMetrics?.outboundCallsMade ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-1" title="Talk time today">
              <Clock className="h-4 w-4" />
              <span className="font-medium tabular-nums">
                {formatTalkTime(todayMetrics?.talkTimeSeconds ?? 0)}
              </span>
            </div>
          </div>

          {/* Toggle switch */}
          <div className="flex-shrink-0">
            <Switch
              checked={user.status !== "offline"}
              onCheckedChange={handleToggleStatus}
              className="data-[state=checked]:bg-purple-500"
            />
          </div>
        </div>

        {/* Targeted ringing indicator - shows when a parked call is unparked to this specific user */}
        {targetedRinging && (
          <div className="mt-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 animate-pulse">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500 animate-bounce">
                  <Phone className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-purple-900 dark:text-purple-100">
                    {targetedRinging.callerName || targetedRinging.callerNumber}
                  </p>
                  <p className="text-xs text-purple-700 dark:text-purple-300">
                    Incoming transfer {"\u2022"} {ringTime}s
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDeclineTargeted}
                  className="h-9 w-9 p-0"
                >
                  <PhoneOff className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={handleAcceptTargeted}
                  className="h-9 px-4 bg-green-600 hover:bg-green-700"
                >
                  <PhoneCall className="h-4 w-4 mr-1" />
                  Answer
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Multi-call mode: Render all connected calls */}
        {isMultiCallMode && connectedCalls.length > 0 && (
          <div className="mt-3 space-y-2">
            {connectedCalls.map((callInfo) => {
              // Find matching Convex call by twilioCallSid
              const matchingCall = activeCalls.find(c => c.twilioCallSid === callInfo.callSid);
              const isFocused = callInfo.callSid === focusedCallSid;

              return (
                <ActiveCallCard
                  key={callInfo.callSid}
                  call={{
                    _id: matchingCall?._id || callInfo.callSid,
                    twilioCallSid: callInfo.callSid,
                    from: callInfo.from || "Unknown",
                    fromName: matchingCall?.fromName,
                    state: callInfo.isHeld ? "on_hold" : "connected",
                    startedAt: matchingCall?.startedAt || callInfo.startedAt,
                    answeredAt: matchingCall?.answeredAt || callInfo.answeredAt,
                  }}
                  activeCall={callInfo.call}
                  onEndCall={() => onHangUpBySid?.(callInfo.callSid)}
                  compact
                  isFocused={isFocused}
                  isHeld={callInfo.isHeld}
                  onFocus={() => onFocusCall?.(callInfo.callSid)}
                  onHold={() => onHoldCall?.(callInfo.callSid)}
                  onUnhold={() => onUnholdCall?.(callInfo.callSid)}
                  showFocusControls={connectedCalls.length > 1}
                />
              );
            })}
          </div>
        )}

        {/* Legacy: Active Twilio call - draggable card when connected */}
        {!isMultiCallMode && twilioCallConnected && (() => {
          // Find the matching Convex call by twilioCallSid to get the real _id
          const twilioCallSid = twilioActiveCall.parameters?.CallSid;
          const matchingCall = activeCalls.find(c => c.twilioCallSid === twilioCallSid);

          return (
            <div className="mt-3">
              <ActiveCallCard
                call={{
                  _id: matchingCall?._id || twilioCallSid || "unknown",
                  twilioCallSid: twilioCallSid,
                  from: twilioActiveCall.parameters?.From || "Unknown",
                  fromName: matchingCall?.fromName,
                  state: "connected",
                  startedAt: matchingCall?.startedAt || callStartTime || Date.now(),
                  answeredAt: matchingCall?.answeredAt || callStartTime || Date.now(),
                }}
                activeCall={twilioActiveCall}
                onEndCall={onHangUp}
                compact
              />
            </div>
          );
        })()}

        {/* Active calls from database for this user (when no Twilio call is connected) */}
        {activeCalls.length > 0 && !twilioCallConnected && connectedCalls.length === 0 && (
          <div className="mt-3 space-y-2">
            {activeCalls.map((call) => (
              <ActiveCallCard
                key={call._id}
                call={call}
                activeCall={twilioActiveCall}
                onEndCall={onHangUp}
                compact
              />
            ))}
          </div>
        )}

        {/* Drop zone indicator */}
        {isOver && (
          <div className="mt-2 rounded-md border-2 border-dashed border-primary bg-primary/5 p-2 text-center text-xs text-primary">
            Drop to transfer call
          </div>
        )}
      </CardContent>
    </Card>
  );
}
