"use client";

import { useDroppable } from "@dnd-kit/core";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { cardPatterns, statusColors } from "@/lib/style-constants";
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
import { useOptionalCallingContext } from "./calling-provider";

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

  // Optimistic-hangup set from the calling context — we filter the
  // DB-fallback render block (line ~411) by it so a just-hung-up call
  // doesn't briefly re-render from `activeCalls` between the local
  // `removeCall` and the Convex subscription update arriving.
  const callingCtx = useOptionalCallingContext();
  const recentlyHungUpSids = callingCtx?.recentlyHungUpSids ?? new Set<string>();

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

  // Track call start time when first connected call appears.
  useEffect(() => {
    if (connectedCalls.length > 0 && !callStartTime) {
      setCallStartTime(Date.now());
    } else if (connectedCalls.length === 0) {
      setCallStartTime(null);
    }
  }, [callStartTime, connectedCalls.length]);

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

  const status = statusColors[user.status as keyof typeof statusColors] || statusColors.offline;
  const hasActiveCalls = activeCalls.length > 0 || connectedCalls.length > 0;
  const totalCallCount = connectedCalls.length;

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
        cardPatterns.pageCard,
        "gap-0 py-0 transition-all duration-200",
        isOver && "ring-2 ring-primary ring-offset-2",
        user.status === "offline" && "opacity-60",
        hasActiveCalls ? "border-primary border-2" : "border-border"
      )}
    >
      <CardContent className="p-4">
        {/* Main horizontal bar layout */}
        <div className="flex items-center gap-3">
          {/* Avatar with status dot */}
          <div className="relative flex-shrink-0">
            <Avatar className="h-14 w-14 ring-2 ring-primary/20">
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
            <p className="font-bold truncate text-sm">{user.name}</p>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="text-xs px-1.5 py-0"
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
          <div className="flex items-center gap-3 text-xs text-on-surface-variant">
            <div className="flex items-center gap-1" title="Inbound calls accepted today">
              <PhoneIncoming className="h-4 w-4 text-primary" />
              <span className="font-medium tabular-nums">
                {todayMetrics?.inboundCallsAccepted ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-1" title="Outbound calls made today">
              <PhoneOutgoing className="h-4 w-4 text-blue-600" />
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
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </div>

        {/* Targeted ringing indicator - shows when a parked call is unparked to this specific user */}
        {targetedRinging && (
          <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50/80 p-3 animate-pulse dark:border-blue-900/60 dark:bg-blue-950/20">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary animate-bounce">
                  <Phone className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {targetedRinging.callerName || targetedRinging.callerNumber}
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
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

        {/* Active calls from database for this user (when no Twilio call is connected).
            Filter out rows the local hook just removed — without this
            we'd briefly re-render the card during the ~200 ms window
            between `removeCall` and the Convex subscription delivering
            the deletion. */}
        {(() => {
          const visibleDbCalls = activeCalls.filter(
            (c) =>
              // Parked calls belong to the parking lot, not the agent
              // who parked them — they should NOT render under any
              // user card. Defensive in case parkByCallSid couldn't
              // clear assignedUserId (legacy rows or race conditions).
              c.state !== "parked" &&
              !recentlyHungUpSids.has(c.twilioCallSid) &&
              !recentlyHungUpSids.has(c.childCallSid),
          );
          return (
            visibleDbCalls.length > 0 &&
            connectedCalls.length === 0 && (
              <div className="mt-3 space-y-2">
                {visibleDbCalls.map((call) => (
                  <ActiveCallCard
                    key={call._id}
                    call={call}
                    onEndCall={onHangUp}
                    compact
                  />
                ))}
              </div>
            )
          );
        })()}

        {/* Drop zone indicator */}
        {isOver && (
          <div className="mt-2 rounded-xl border-2 border-dashed border-primary bg-primary/5 p-2 text-center text-xs text-primary">
            Drop to transfer call
          </div>
        )}
      </CardContent>
    </Card>
  );
}
