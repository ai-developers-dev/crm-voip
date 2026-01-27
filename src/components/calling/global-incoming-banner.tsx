"use client";

import { useCallback } from "react";
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

  // If no calling context (e.g., on onboarding pages), render nothing
  if (!callingContext) {
    return null;
  }

  const {
    getPendingCalls,
    getActiveCalls,
    answerCallBySid,
    rejectCallBySid,
    convexOrgId,
    currentUserId,
  } = callingContext;

  // Query for active targeted ringing records
  const targetedRinging = useQuery(
    api.targetedRinging.getActiveForOrg,
    convexOrgId ? { organizationId: convexOrgId } : "skip"
  );

  const pendingCalls = getPendingCalls();
  const activeCalls = getActiveCalls();
  const connectedCallCount = activeCalls.length;

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

  if (nonTargetedCalls.length === 0) {
    return null;
  }

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
          onAnswer={() => answerCallBySid(callInfo.callSid, true)}
          onDecline={() => rejectCallBySid(callInfo.callSid)}
          hasActiveCall={connectedCallCount > 0}
        />
      ))}
    </div>
  );
}
