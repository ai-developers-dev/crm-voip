"use client";

import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Pause } from "lucide-react";
import { useEffect, useState } from "react";

interface IncomingCallPopupProps {
  call: {
    _id: string;
    from: string;
    fromName?: string;
    startedAt: number;
  };
  onAnswer?: () => void;
  onDecline?: () => void;
  // Multi-call support
  hasActiveCall?: boolean;
}

export function IncomingCallPopup({
  call,
  onAnswer,
  onDecline,
  hasActiveCall = false,
}: IncomingCallPopupProps) {
  const [ringTime, setRingTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRingTime(Math.floor((Date.now() - call.startedAt) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [call.startedAt]);

  return (
    <div className="w-full bg-purple-600 text-white px-4 py-2 animate-in slide-in-from-top-2 shadow-md">
      <div className="flex items-center justify-between gap-4">
        {/* Pulsing phone icon + Caller info */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 animate-pulse">
            <Phone className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Incoming Call:</span>
            <span className="font-medium">
              {call.fromName || call.from}
            </span>
            <span className="text-purple-200 text-sm">
              ({ringTime}s)
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 bg-red-600 hover:bg-red-700 text-white"
            onClick={onDecline}
          >
            <PhoneOff className="h-4 w-4 mr-1" />
            Decline
          </Button>
          <Button
            size="sm"
            className="h-8 bg-green-600 hover:bg-green-700 text-white"
            onClick={onAnswer}
          >
            {hasActiveCall ? (
              <>
                <Pause className="h-4 w-4 mr-1" />
                Answer & Hold
              </>
            ) : (
              <>
                <Phone className="h-4 w-4 mr-1" />
                Answer
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Multi-call indicator */}
      {hasActiveCall && (
        <div className="mt-1 text-xs text-purple-200">
          Your current call will be placed on hold
        </div>
      )}
    </div>
  );
}
