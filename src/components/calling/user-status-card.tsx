"use client";

import { useDroppable } from "@dnd-kit/core";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Clock, Mic, MicOff } from "lucide-react";
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
  };
  activeCalls: any[];
  twilioActiveCall?: any;
  onHangUp?: () => void;
  onToggleMute?: () => boolean;
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
  onToggleMute
}: UserStatusCardProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: user.id,
    data: { type: "user", user },
  });

  const toggleStatus = useMutation(api.users.toggleStatus);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);

  // Check if the Twilio call is connected (not pending/ringing)
  const twilioCallConnected = twilioActiveCall &&
    twilioActiveCall.status &&
    (twilioActiveCall.status() === "open" || twilioActiveCall.status() === "connecting");

  // Track call start time when call connects
  useEffect(() => {
    if (twilioCallConnected && !callStartTime) {
      setCallStartTime(Date.now());
    } else if (!twilioCallConnected) {
      setCallStartTime(null);
      setCallDuration(0);
    }
  }, [twilioCallConnected, callStartTime]);

  // Update duration every second when connected
  useEffect(() => {
    if (!twilioCallConnected || !callStartTime) return;

    const interval = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - callStartTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [twilioCallConnected, callStartTime]);

  // Sync mute state with Twilio call
  useEffect(() => {
    if (twilioActiveCall) {
      setIsMuted(twilioActiveCall.isMuted?.() || false);
    }
  }, [twilioActiveCall]);

  const handleMuteToggle = useCallback(() => {
    if (onToggleMute) {
      const newMuted = onToggleMute();
      setIsMuted(newMuted);
    }
  }, [onToggleMute]);

  // Format call duration (MM:SS)
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

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
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1" title="Calls accepted today">
              <Phone className="h-4 w-4" />
              <span className="font-medium tabular-nums">
                {todayMetrics?.callsAccepted ?? 0}
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

        {/* Active Twilio call - expands below when connected */}
        {twilioCallConnected && (
          <div className="mt-3 p-3 rounded-lg border-2 border-green-500 bg-green-50 dark:bg-green-900/20">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <Phone className="h-4 w-4 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-sm">
                  {twilioActiveCall.parameters?.From || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Connected • {formatDuration(callDuration)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={isMuted ? "destructive" : "secondary"}
                  size="sm"
                  onClick={handleMuteToggle}
                  className="h-8"
                >
                  {isMuted ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onHangUp}
                  className="h-8"
                >
                  <PhoneOff className="h-4 w-4 mr-1" />
                  End
                </Button>
              </div>
            </div>
          </div>
        )}

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
