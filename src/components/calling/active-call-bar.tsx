"use client";

import { useEffect, useState } from "react";
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
  Loader2,
  ParkingSquare,
} from "lucide-react";
import { useOptionalCallingContext } from "./calling-provider";
import { useIsCallsPage } from "./calls-page-route";
import { formatPhoneDisplay } from "@/lib/phone";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * ActiveCallBar
 *
 * The persistent call strip anchored below the tenant nav. Renders for:
 *  - an outbound call in the "Dialing…" state (status === "connecting")
 *  - any connected call (status === "open") inbound or outbound
 *
 * During dialing it shows Spinner + number + End + Park. On connect it
 * swaps to the full control row (Mute / Hold / Park / End / Dashboard).
 */
export function ActiveCallBar() {
  const callingContext = useOptionalCallingContext();
  const [callDuration, setCallDuration] = useState(0);
  const [parking, setParking] = useState(false);

  // The Calls pages already render the active call inside each user
  // card (UserStatusCard's connected-call sub-card) with its own
  // controls. Showing this bar there duplicates the same call in two
  // places. Hide on /dashboard and on the tenant ROOT route only —
  // NOT on tenant sub-routes like /admin/tenants/[id]/sms, where the
  // user has navigated away from the call grid and absolutely DOES
  // need this bar to see the active call.
  const callsPageOwnsBar = useIsCallsPage();

  // Extract values from context (with defaults for when context is null)
  const getActiveCalls = callingContext?.getActiveCalls;
  const getAllCalls = callingContext?.getAllCalls;
  const focusedCallSid = callingContext?.focusedCallSid;
  const toggleMuteBySid = callingContext?.toggleMuteBySid;
  const holdCall = callingContext?.holdCall;
  const unholdCall = callingContext?.unholdCall;
  const hangUpBySid = callingContext?.hangUpBySid;
  const calls = callingContext?.calls ?? new Map();
  const convexOrgId = callingContext?.convexOrgId;
  const currentUserId = callingContext?.currentUserId;

  const activeCalls = getActiveCalls?.() ?? [];
  const allCalls = getAllCalls?.() ?? [];

  // Prefer the focused call; fall back to any non-closed outbound call so
  // the "Dialing…" state shows even before focus resolves.
  const focusedCall = focusedCallSid ? calls.get(focusedCallSid) : null;
  const dialingCall = allCalls.find(
    (c) => c.direction === "OUTGOING" && c.status === "connecting",
  );
  const displayCall = focusedCall ?? dialingCall ?? null;
  const isDialing = displayCall?.status === "connecting";

  // Update call duration every second - MUST be called unconditionally
  useEffect(() => {
    if (!displayCall?.answeredAt) {
      setCallDuration(0);
      return;
    }
    const updateDuration = () => {
      const duration = Math.floor((Date.now() - displayCall.answeredAt!) / 1000);
      setCallDuration(duration);
    };
    updateDuration();
    const interval = setInterval(updateDuration, 1000);
    return () => clearInterval(interval);
  }, [displayCall?.answeredAt]);

  if (!callingContext) return null;
  if (callsPageOwnsBar) return null;

  // No calls at all — hide.
  if (!displayCall) return null;

  // Don't render for an incoming call that hasn't been answered yet. The
  // first incoming call becomes `focusedCall` immediately (see
  // `addCallToState` → `shouldFocus = !prev.focusedCallSid`), which used
  // to cause the green "End" bar to render on top of the blue "Incoming
  // Call / Decline / Answer" banner — two UI treatments for the same
  // ringing call. The blue banner (IncomingCallsArea / GlobalIncomingBanner)
  // owns the pre-answer UX; this bar owns dialing + connected.
  if (
    displayCall.status === "pending" &&
    displayCall.direction === "INCOMING"
  ) {
    return null;
  }

  const handleToggleMute = () => {
    if (displayCall.callSid && toggleMuteBySid) {
      toggleMuteBySid(displayCall.callSid);
    }
  };

  const handleToggleHold = async () => {
    if (!displayCall.callSid) return;
    if (displayCall.isHeld) {
      await unholdCall?.(displayCall.callSid);
    } else {
      await holdCall?.(displayCall.callSid);
    }
  };

  const handleHangUp = () => {
    if (displayCall.callSid && hangUpBySid) {
      hangUpBySid(displayCall.callSid);
    }
  };

  const handlePark = async () => {
    if (!displayCall.callSid || !convexOrgId) return;
    setParking(true);
    try {
      const res = await fetch("/api/twilio/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twilioCallSid: displayCall.callSid,
          callerNumber:
            displayCall.direction === "INCOMING"
              ? displayCall.from
              : displayCall.to,
          organizationId: convexOrgId,
          parkedByUserId: currentUserId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Park failed:", err);
        alert(`Failed to park: ${err.error ?? err.details ?? "Unknown"}`);
      }
    } catch (e) {
      console.error("Park error:", e);
    } finally {
      setParking(false);
    }
  };

  // Caller identity for display
  const rawDisplay =
    displayCall.direction === "INCOMING" ? displayCall.from : displayCall.to;
  const callerDisplay = formatPhoneDisplay(rawDisplay || "");

  return (
    <div className="sticky top-14 z-40 bg-green-600 text-white border-b border-green-700 neu-ambient">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Call info */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
            {isDialing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Phone className="h-4 w-4 animate-pulse" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {isDialing && (
              <span className="text-sm text-green-100 uppercase tracking-wide">
                {displayCall.direction === "OUTGOING" ? "Dialing" : "Ringing"}
              </span>
            )}
            <span className="font-bold">{callerDisplay || rawDisplay}</span>
            {!isDialing && (
              <span className="text-green-200 text-sm">
                {formatDuration(callDuration)}
              </span>
            )}
            {displayCall.isHeld && (
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
          {/* Mute + Hold only once connected */}
          {!isDialing && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 hover:bg-white/20 text-white"
                onClick={handleToggleMute}
                title={displayCall.isMuted ? "Unmute" : "Mute"}
              >
                {displayCall.isMuted ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="h-8 hover:bg-white/20 text-white"
                onClick={handleToggleHold}
                title={displayCall.isHeld ? "Resume" : "Hold"}
              >
                {displayCall.isHeld ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
              </Button>
            </>
          )}

          {/* Park (available while dialing AND connected) */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 hover:bg-white/20 text-white"
            onClick={handlePark}
            disabled={parking || isDialing}
            title={
              isDialing ? "Park available after connect" : "Send to parking lot"
            }
          >
            {parking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ParkingSquare className="h-4 w-4" />
            )}
          </Button>

          {/* End call */}
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
