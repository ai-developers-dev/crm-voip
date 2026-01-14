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
  twilioActiveCall?: any;
  onHangUp?: () => void;
  onToggleMute?: () => boolean;
  onAnswerTwilio?: () => void;
  onRejectTwilio?: () => void;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; dotColor: string }> = {
  available: {
    label: "Available",
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    dotColor: "bg-green-500",
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

  // Check if the Twilio call is connected (not pending/ringing)
  const twilioCallConnected = twilioActiveCall &&
    twilioActiveCall.status &&
    (twilioActiveCall.status() === "open" || twilioActiveCall.status() === "connecting");

  // Check if Twilio call is pending (ringing) for this user
  const twilioCallPending = twilioActiveCall &&
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
    if (!targetedRinging || !onAnswerTwilio) return;

    console.log("Accepting targeted call:", targetedRinging.callerNumber);

    // Mark as accepted in database
    await acceptTargetedCall({ id: targetedRinging._id });

    // Answer the Twilio call
    onAnswerTwilio();
  }, [targetedRinging, onAnswerTwilio, acceptTargetedCall]);

  // Handle declining targeted call
  const handleDeclineTargeted = useCallback(async () => {
    if (!targetedRinging || !onRejectTwilio) return;

    console.log("Declining targeted call:", targetedRinging.callerNumber);

    // Mark as declined in database
    await declineTargetedCall({ id: targetedRinging._id });

    // Reject the Twilio call
    onRejectTwilio();
  }, [targetedRinging, onRejectTwilio, declineTargetedCall]);

  // Track call start time when call connects
  useEffect(() => {
    if (twilioCallConnected && !callStartTime) {
      setCallStartTime(Date.now());
    } else if (!twilioCallConnected) {
      setCallStartTime(null);
    }
  }, [twilioCallConnected, callStartTime]);

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
  const hasActiveCalls = activeCalls.length > 0 || twilioCallConnected;

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
            <Badge
              variant="secondary"
              className={cn("text-xs px-1.5 py-0", status.bgColor, status.color)}
            >
              {status.label}
            </Badge>
          </div>

          {/* Daily metrics */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1" title="Inbound calls accepted today">
              <PhoneIncoming className="h-4 w-4 text-green-600" />
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
              className="data-[state=checked]:bg-green-500"
            />
          </div>
        </div>

        {/* Targeted ringing indicator - shows when a parked call is unparked to this specific user */}
        {targetedRinging && twilioCallPending && (
          <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 animate-pulse">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 animate-bounce">
                  <Phone className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-amber-900 dark:text-amber-100">
                    {targetedRinging.callerName || targetedRinging.callerNumber}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Incoming transfer • {ringTime}s
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

        {/* Active Twilio call - draggable card when connected */}
        {twilioCallConnected && (() => {
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

        {/* Active calls from database for this user */}
        {activeCalls.length > 0 && !twilioCallConnected && (
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
