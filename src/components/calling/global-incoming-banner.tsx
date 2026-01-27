"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useOptionalCallingContext } from "./calling-provider";
import { IncomingCallPopup } from "./incoming-call-popup";

/**
 * GlobalIncomingBanner
 *
 * A global incoming call banner that appears on ALL pages in the dashboard.
 * Shows incoming calls that are NOT targeted to a specific user (e.g., from parking lot unpark).
 *
 * This component is designed to be used at the layout level to provide
 * call notification capabilities across the entire application.
 */
export function GlobalIncomingBanner() {
  const callingContext = useOptionalCallingContext();

  // Extract values from context (with defaults for when context is null)
  const calls = callingContext?.calls ?? new Map();
  const getPendingCalls = callingContext?.getPendingCalls;
  const getActiveCalls = callingContext?.getActiveCalls;
  const answerCallBySid = callingContext?.answerCallBySid;
  const rejectCallBySid = callingContext?.rejectCallBySid;
  const convexOrgId = callingContext?.convexOrgId;
  const currentUserId = callingContext?.currentUserId;
  const isReady = callingContext?.isReady ?? false;

  // Query for active targeted ringing records - MUST be called unconditionally
  const targetedRinging = useQuery(
    api.targetedRinging.getActiveForOrg,
    convexOrgId ? { organizationId: convexOrgId } : "skip"
  );

  // Get pending and active calls
  const pendingCalls = getPendingCalls?.() ?? [];
  const activeCalls = getActiveCalls?.() ?? [];
  const connectedCallCount = activeCalls.length;

  // Debug logging - MUST be called unconditionally
  useEffect(() => {
    if (!callingContext) return;

    console.log("[GlobalIncomingBanner] State:", {
      isReady,
      callsSize: calls.size,
      pendingCallsCount: pendingCalls.length,
      pendingCalls: pendingCalls.map(c => ({ callSid: c.callSid, from: c.from, status: c.status })),
      convexOrgId,
      currentUserId,
    });
  }, [callingContext, isReady, calls.size, pendingCalls.length, convexOrgId, currentUserId]);

  // Render-time log (runs on every render)
  if (callingContext) {
    console.log("[GlobalIncomingBanner] RENDER - calls.size:", calls.size, "pendingCalls:", pendingCalls.length);
  }

  // If no calling context (e.g., on onboarding pages), render nothing
  if (!callingContext) {
    return null;
  }

  // Filter out targeted calls (they show in user cards instead on the dashboard)
  // Check both by agentCallSid AND by whether current user is the target
  // (agentCallSid may not be set yet due to timing - call arrives before mutation completes)
  const nonTargetedCalls = pendingCalls.filter((call) => {
    // Direct match by agentCallSid
    const isTargetedByCallSid = targetedRinging?.some(
      (tr) => tr.agentCallSid === call.callSid && tr.status === "ringing"
    );
    // If current user is the target of ANY ringing call, filter out their pending calls
    // This handles the race condition where agentCallSid isn't set yet
    const isTargetedToCurrentUser =
      currentUserId &&
      targetedRinging?.some(
        (tr) => tr.targetUserId === currentUserId && tr.status === "ringing"
      );
    return !isTargetedByCallSid && !isTargetedToCurrentUser;
  });

  // Debug: Log when we have pending calls but filter them all out
  if (pendingCalls.length > 0 && nonTargetedCalls.length === 0) {
    console.log("[GlobalIncomingBanner] All pending calls filtered out as targeted:", {
      pendingCalls: pendingCalls.map(c => c.callSid),
      targetedRinging: targetedRinging?.map(tr => ({ targetUserId: tr.targetUserId, agentCallSid: tr.agentCallSid, status: tr.status })),
      currentUserId,
    });
  }

  if (nonTargetedCalls.length === 0) {
    return null;
  }

  console.log("[GlobalIncomingBanner] Rendering banner for calls:", nonTargetedCalls.map(c => c.callSid));

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {nonTargetedCalls.map((callInfo) => (
        <IncomingCallPopup
          key={callInfo.callSid}
          call={{
            _id: callInfo.callSid,
            from: callInfo.from || "Unknown",
            fromName: undefined,
            startedAt: callInfo.startedAt,
          }}
          onAnswer={() => answerCallBySid?.(callInfo.callSid, true)}
          onDecline={() => rejectCallBySid?.(callInfo.callSid)}
          hasActiveCall={connectedCallCount > 0}
        />
      ))}
    </div>
  );
}
