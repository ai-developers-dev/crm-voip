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
    name: string;
    status: string;
    avatarUrl?: string | null;
  };
  activeCalls: any[];
  twilioActiveCall?: any;
  onHangUp?: () => void;
  onToggleMute?: () => boolean;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  available: {
    label: "Available",
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  busy: {
    label: "Busy",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
  },
  on_call: {
    label: "On Call",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  on_break: {
    label: "On Break",
    color: "text-orange-600",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
  },
  offline: {
    label: "Offline",
    color: "text-gray-500",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
  },
};

export function UserStatusCard({ user, activeCalls, twilioActiveCall, onHangUp, onToggleMute }: UserStatusCardProps) {
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

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
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
        hasActiveCalls && "border-primary"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="relative">
            <Avatar className="h-12 w-12">
              <AvatarImage src={user.avatarUrl || undefined} />
              <AvatarFallback className={status.bgColor}>
                {user.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div
              className={cn(
                "absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-background",
                user.status === "available" && "bg-green-500",
                user.status === "busy" && "bg-yellow-500",
                user.status === "on_call" && "bg-primary",
                user.status === "on_break" && "bg-orange-500",
                user.status === "offline" && "bg-gray-400"
              )}
            />
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{user.name}</p>
            <Badge
              variant="secondary"
              className={cn("mt-1 text-xs", status.bgColor, status.color)}
            >
              {status.label}
            </Badge>
          </div>

          <div className="flex flex-col items-end gap-1">
            {hasActiveCalls && (
              <Phone className="h-5 w-5 text-primary animate-pulse" />
            )}
            <Switch
              checked={user.status !== "offline"}
              onCheckedChange={handleToggleStatus}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </div>

        {/* Active Twilio call - shows immediately when call is connected */}
        {twilioCallConnected && (
          <div className="mt-3 p-3 rounded-lg border-2 border-green-500 bg-green-50 dark:bg-green-900/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <Phone className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {twilioActiveCall.parameters?.From || "Unknown"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Connected • {formatDuration(callDuration)}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant={isMuted ? "destructive" : "secondary"}
                size="sm"
                onClick={handleMuteToggle}
                className="flex-1"
              >
                {isMuted ? (
                  <>
                    <MicOff className="h-4 w-4 mr-1" />
                    Unmute
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-1" />
                    Mute
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={onHangUp}
                className="flex-1"
              >
                <PhoneOff className="h-4 w-4 mr-1" />
                End
              </Button>
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
          <div className="mt-3 rounded-md border-2 border-dashed border-primary bg-primary/5 p-2 text-center text-sm text-primary">
            Drop to transfer call
          </div>
        )}
      </CardContent>
    </Card>
  );
}
