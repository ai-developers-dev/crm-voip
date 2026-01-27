"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Pause,
  Play,
  ExternalLink,
} from "lucide-react";
import { useOptionalCallingContext } from "./calling-provider";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * ActiveCallBar
 *
 * A persistent mini call control bar that appears at the top of the page
 * when the user has an active call and navigates away from the /dashboard page.
 *
 * Shows:
 * - Caller info (name/number)
 * - Call duration
 * - Mute/Unmute button
 * - Hold/Unhold button
 * - Hang up button
 * - Link to return to full dashboard
 */
export function ActiveCallBar() {
  const callingContext = useOptionalCallingContext();
  const pathname = usePathname();
  const [callDuration, setCallDuration] = useState(0);

  // Extract values from context (with defaults for when context is null)
  const getActiveCalls = callingContext?.getActiveCalls;
  const focusedCallSid = callingContext?.focusedCallSid;
  const toggleMuteBySid = callingContext?.toggleMuteBySid;
  const holdCall = callingContext?.holdCall;
  const unholdCall = callingContext?.unholdCall;
  const hangUpBySid = callingContext?.hangUpBySid;
  const calls = callingContext?.calls ?? new Map();

  const activeCalls = getActiveCalls?.() ?? [];
  const focusedCall = focusedCallSid ? calls.get(focusedCallSid) : null;

  // Update call duration every second - MUST be called unconditionally
  useEffect(() => {
    if (!focusedCall?.answeredAt) {
      setCallDuration(0);
      return;
    }

    const updateDuration = () => {
      const duration = Math.floor((Date.now() - focusedCall.answeredAt!) / 1000);
      setCallDuration(duration);
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);
    return () => clearInterval(interval);
  }, [focusedCall?.answeredAt]);

  // If no calling context, render nothing
  if (!callingContext) {
    return null;
  }

  // Don't show on the dashboard page (full controls are already there)
  // Also don't show if no active calls
  if (pathname === "/dashboard" || activeCalls.length === 0 || !focusedCall) {
    return null;
  }

  const handleToggleMute = () => {
    if (focusedCallSid && toggleMuteBySid) {
      toggleMuteBySid(focusedCallSid);
    }
  };

  const handleToggleHold = async () => {
    if (!focusedCallSid) return;
    if (focusedCall.isHeld) {
      await unholdCall?.(focusedCallSid);
    } else {
      await holdCall?.(focusedCallSid);
    }
  };

  const handleHangUp = () => {
    if (focusedCallSid && hangUpBySid) {
      hangUpBySid(focusedCallSid);
    }
  };

  // Determine display info
  const callerDisplay =
    focusedCall.direction === "INCOMING"
      ? focusedCall.from
      : focusedCall.to;

  return (
    <div className="fixed top-14 left-0 right-0 z-50 bg-green-600 text-white shadow-lg">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Call info */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
            <Phone className="h-4 w-4 animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{callerDisplay}</span>
            <span className="text-green-200 text-sm">
              {formatDuration(callDuration)}
            </span>
            {focusedCall.isHeld && (
              <span className="text-xs bg-yellow-500 text-yellow-900 px-2 py-0.5 rounded-full font-medium">
                ON HOLD
              </span>
            )}
            {activeCalls.length > 1 && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                +{activeCalls.length - 1} more
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Mute button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 hover:bg-white/20 text-white"
            onClick={handleToggleMute}
            title={focusedCall.isMuted ? "Unmute" : "Mute"}
          >
            {focusedCall.isMuted ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>

          {/* Hold button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 hover:bg-white/20 text-white"
            onClick={handleToggleHold}
            title={focusedCall.isHeld ? "Resume" : "Hold"}
          >
            {focusedCall.isHeld ? (
              <Play className="h-4 w-4" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
          </Button>

          {/* End call button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 bg-red-600 hover:bg-red-700 text-white"
            onClick={handleHangUp}
            title="End Call"
          >
            <PhoneOff className="h-4 w-4 mr-1" />
            End
          </Button>

          {/* Go to dashboard link */}
          <Link href="/dashboard">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 hover:bg-white/20 text-white"
              title="Open full call controls"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
