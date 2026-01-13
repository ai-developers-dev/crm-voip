"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Phone, PhoneOff, User } from "lucide-react";
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
}

export function IncomingCallPopup({
  call,
  onAnswer,
  onDecline,
}: IncomingCallPopupProps) {
  const [ringTime, setRingTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRingTime(Math.floor((Date.now() - call.startedAt) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [call.startedAt]);

  return (
    <Card className="min-w-[320px] animate-in slide-in-from-top-5 shadow-lg border-2 border-yellow-500">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Caller avatar */}
          <div className="relative">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
              <User className="h-7 w-7 text-yellow-600" />
            </div>
            <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500 animate-pulse">
              <Phone className="h-3 w-3 text-white" />
            </div>
          </div>

          {/* Caller info */}
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Incoming Call</p>
            <p className="text-lg font-semibold">
              {call.fromName || call.from}
            </p>
            <p className="text-sm text-muted-foreground">
              Ringing for {ringTime}s
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={onDecline}
            >
              <PhoneOff className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              className="h-12 w-12 rounded-full bg-green-500 hover:bg-green-600"
              onClick={onAnswer}
            >
              <Phone className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
