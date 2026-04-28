"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { UserStatusCard } from "./user-status-card";
import { IncomingCallPopup } from "./incoming-call-popup";
import { ParkingLot } from "./parking-lot";
import { ActiveCallCard } from "./active-call-card";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Users, Wifi, WifiOff, Loader2, GripVertical } from "lucide-react";
import { useOptionalCallingContext } from "./calling-provider";
import { useTwilioDevice } from "@/hooks/use-twilio-device";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { useParkingStore, generateTempParkingId } from "@/lib/stores/parking-store";
import { DailyCallLog } from "./daily-call-log";
import { TransferModeToggle, useTransferMode } from "./transfer-mode-toggle";
import { cardPatterns } from "@/lib/style-constants";
import { cn } from "@/lib/utils";

interface CallingDashboardProps {
  organizationId?: string;
  viewMode?: "normal" | "admin"; // admin mode = viewing as platform admin
}

export function CallingDashboard({ organizationId, viewMode = "normal" }: CallingDashboardProps) {
  const [dragActiveCall, setDragActiveCall] = useState<any>(null);

  // Configure drag sensors with activation constraint
  // Requires 8px movement before drag starts - prevents accidental drags when clicking buttons
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Try to use the global CallingContext first (from layout provider)
  const callingContext = useOptionalCallingContext();

  // Use org/user from CallingContext when available (avoids duplicate queries)
  const convexOrgId = callingContext?.convexOrgId;
  const currentUserId = callingContext?.currentUserId;

  // Only query if no context (e.g., admin viewing a tenant directly)
  const convexOrgFallback = useQuery(
    api.organizations.getCurrent,
    !callingContext && organizationId ? { clerkOrgId: organizationId } : "skip"
  );
  const currentUserFallback = useQuery(
    api.users.getCurrentByOrg,
    !callingContext && convexOrgFallback?._id ? { organizationId: convexOrgFallback._id } : "skip"
  );

  const effectiveOrgId = convexOrgId || convexOrgFallback?._id;
  const effectiveUserId = currentUserId || currentUserFallback?._id;
  const maxConcurrentCalls = callingContext?.maxConcurrentCalls ?? 3;

  // Fallback to direct useTwilioDevice if not using context (e.g., admin viewing tenant)
  const directTwilioDevice = useTwilioDevice(
    callingContext ? 0 : maxConcurrentCalls
  );

  // Use context if available, otherwise use direct hook
  const twilioReady = callingContext?.isReady ?? directTwilioDevice.isReady;
  const twilioActiveCall = callingContext?.activeCall ?? directTwilioDevice.activeCall;
  const twilioCallStatus = callingContext?.callStatus ?? directTwilioDevice.callStatus;
  const twilioError = callingContext?.error ?? directTwilioDevice.error;
  const getAllCalls = callingContext?.getAllCalls ?? directTwilioDevice.getAllCalls;
  const getPendingCalls = callingContext?.getPendingCalls ?? directTwilioDevice.getPendingCalls;
  const focusedCallSid = callingContext?.focusedCallSid ?? directTwilioDevice.focusedCallSid;
  const callCount = callingContext?.callCount ?? directTwilioDevice.callCount;
  const answerCall = callingContext?.answerCall ?? directTwilioDevice.answerCall;
  const rejectCall = callingContext?.rejectCall ?? directTwilioDevice.rejectCall;
  const hangUp = callingContext?.hangUp ?? directTwilioDevice.hangUp;
  const toggleMute = callingContext?.toggleMute ?? directTwilioDevice.toggleMute;
  const answerCallBySid = callingContext?.answerCallBySid ?? directTwilioDevice.answerCallBySid;
  const rejectCallBySid = callingContext?.rejectCallBySid ?? directTwilioDevice.rejectCallBySid;
  const hangUpBySid = callingContext?.hangUpBySid ?? directTwilioDevice.hangUpBySid;
  const holdCall = callingContext?.holdCall ?? directTwilioDevice.holdCall;
  const unholdCall = callingContext?.unholdCall ?? directTwilioDevice.unholdCall;
  const focusCall = callingContext?.focusCall ?? directTwilioDevice.focusCall;

  // Convex mutations (only needed for operations not handled by context)
  const createTargetedRinging = useMutation(api.targetedRinging.create);
  const setAgentCallSid = useMutation(api.targetedRinging.setAgentCallSid);

  // Persisted "cold vs warm" preference for drag-transfer.
  const [transferMode] = useTransferMode();

  // Parking store for optimistic updates
  const addOptimisticCall = useParkingStore((s) => s.addOptimisticCall);
  const removeOptimisticCall = useParkingStore((s) => s.removeOptimisticCall);
  const setParkingInProgress = useParkingStore((s) => s.setParkingInProgress);

  // For now, show a placeholder since we need Convex organization ID
  if (!organizationId) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Card className={cn(cardPatterns.pageCard, "max-w-md")}>
          <CardContent className="pt-6 text-center">
            <Phone className="mx-auto h-12 w-12 text-on-surface-variant" />
            <h3 className="mt-4 text-sm font-medium">No Organization Selected</h3>
            <p className="mt-2 text-sm text-on-surface-variant">
              Select an organization to view the calling dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDragStart = (event: any) => {
    setDragActiveCall(event.active.data.current?.call);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setDragActiveCall(null);

    if (!over) return;

    const dragData = active.data.current;
    const targetId = over.id as string;

    try {
      // Check over.id directly (like working app) - not over.data.current?.type
      if (over.id === "parking-lot" && dragData?.type === "call" && !dragData?.isParked) {
        console.log("PARKING CALL - drop detected on parking-lot");

        // For multi-call mode, get the focused call
        const allCalls = getAllCalls();
        const focusedCall = allCalls.find(c => c.callSid === focusedCallSid);
        const callToUse = focusedCall?.call || twilioActiveCall;

        if (!callToUse) {
          console.error("No active call to park");
          return;
        }

        if (!effectiveOrgId) {
          console.error("No organization ID available for parking");
          return;
        }

        // Get call info directly from Twilio SDK call
        const callSid = callToUse.parameters.CallSid;
        const callerNumber = callToUse.parameters.From || "Unknown";
        const callerName = dragData?.call?.fromName || undefined;

        // Step 1: Add optimistic entry for immediate UI feedback
        const tempId = generateTempParkingId();
        console.log(`Adding optimistic parking entry: ${tempId}`);
        setParkingInProgress(callSid);
        addOptimisticCall({
          id: tempId,
          twilioCallSid: callSid,
          callerNumber,
          callerName,
          parkedAt: Date.now(),
          parkedByUserId: effectiveUserId,
        });

        try {
          // Step 2: Call hold API (does EVERYTHING: DB save first, then Twilio redirect)
          console.log(`Calling hold API for ${callSid}...`);
          const holdResponse = await fetch("/api/twilio/hold", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              twilioCallSid: callSid,
              callerNumber,
              callerName,
              organizationId: effectiveOrgId!,
              parkedByUserId: effectiveUserId,
            }),
          });

          if (!holdResponse.ok) {
            const error = await holdResponse.json();
            console.error("Failed to park call - Status:", holdResponse.status);
            console.error("Error details:", JSON.stringify(error, null, 2));
            alert(`Failed to park call: ${error.details || error.error || 'Unknown error'}`);
            removeOptimisticCall(tempId);
            setParkingInProgress(null);
            return;
          }

          const holdResult = await holdResponse.json();
          console.log(`Call parked successfully:`, holdResult);
        } finally {
          // Step 3: Remove optimistic entry (real one arrives via Convex subscription)
          removeOptimisticCall(tempId);
          setParkingInProgress(null);
        }

        console.log("Waiting for browser SDK call to disconnect naturally...");
      } else if (targetId.startsWith("user-")) {
        // Handle dropping a call on a user
        const targetUser = over.data.current?.user;
        const sourceType = active.data.current?.type;
        const isFromParking = sourceType === "parked-call";

        if (!targetUser?.clerkUserId) {
          console.error("Target user clerkUserId not found");
          return;
        }

        if (isFromParking) {
          // UNPARK: Resume call from parking lot to target agent
          const pstnCallSid = dragData?.pstnCallSid;
          const conferenceName = dragData?.conferenceName;
          const callerNumber = dragData?.call?.from || "Unknown";
          const callerName = dragData?.call?.fromName;

          if (!pstnCallSid) {
            console.error("PSTN call SID not found for unpark - call may have been parked before this update");
            alert("Cannot unpark this call - missing call information. The call was parked before this feature was updated.");
            return;
          }

          // Get target user's Convex ID from the targetId (format: "user-{convexId}")
          const targetConvexUserId = targetId.replace("user-", "") as Id<"users">;

          // Create targeted ringing record BEFORE calling resume
          if (effectiveOrgId) {
            try {
              await createTargetedRinging({
                organizationId: effectiveOrgId!,
                targetUserId: targetConvexUserId,
                callerNumber,
                callerName,
                pstnCallSid,
              });
              console.log(`Created targeted ringing for ${callerNumber} -> ${targetUser.name}`);
            } catch (e) {
              console.error("Failed to create targeted ringing record:", e);
            }
          }

          // Build the correct Twilio identity: orgId-userId (matches token generation)
          const targetTwilioIdentity = `${organizationId}-${targetUser.clerkUserId}`;
          console.log(`UNPARKING: ${pstnCallSid} -> ${targetUser.name} (identity: ${targetTwilioIdentity})`);

          const resumeResponse = await fetch("/api/twilio/resume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              twilioCallSid: pstnCallSid,
              targetIdentity: targetTwilioIdentity,
              conferenceName: conferenceName,
            }),
          });

          if (!resumeResponse.ok) {
            const error = await resumeResponse.json();
            console.error("Unpark failed:", error);
            alert(`Failed to unpark call: ${error.error || "Unknown error"}`);
          } else {
            const result = await resumeResponse.json();
            console.log("Call unparked successfully:", result);

            // Update targetedRinging with the agent's call SID so we can filter correctly
            if (result.participantSid) {
              try {
                await setAgentCallSid({
                  pstnCallSid,
                  agentCallSid: result.participantSid,
                });
                console.log(`Updated targetedRinging with agentCallSid: ${result.participantSid}`);
              } catch (e) {
                console.error("Failed to update agentCallSid:", e);
              }
            }
          }
        } else {
          // TRANSFER: Transfer active call to another user
          const allCalls = getAllCalls();
          const focusedCall = allCalls.find(c => c.callSid === focusedCallSid);
          const callToUse = focusedCall?.call || twilioActiveCall;
          const callSid = callToUse?.parameters?.CallSid;

          if (!callSid) {
            console.error("Twilio call SID not found for transfer");
            return;
          }

          // Build the correct Twilio identity: orgId-userId (matches token generation)
          const targetTwilioIdentity = `${organizationId}-${targetUser.clerkUserId}`;
          console.log(`Initiating transfer: ${callSid} -> ${targetUser.name} (identity: ${targetTwilioIdentity})`);

          // The transfer route looks up the activeCall row by SID,
          // so we don't need to pass activeCallId from here.
          const transferResponse = await fetch("/api/twilio/transfer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              twilioCallSid: callSid,
              targetUserId: targetId,
              targetIdentity: targetTwilioIdentity,
              type: "direct",
              mode: transferMode, // cold | warm
              sourceUserId: effectiveUserId,
            }),
          });

          if (!transferResponse.ok) {
            const error = await transferResponse.json();
            console.error("Transfer failed:", error);
          } else {
            const result = await transferResponse.json();
            console.log("Transfer initiated:", result);

            // For COLD: source agent's leg auto-disconnects when the
            // caller leaves the <Dial> bridge, so we don't need to
            // do anything locally.
            //
            // For WARM: source agent stays in the conference. Their
            // SDK call is still open, just routed differently. Don't
            // hang it up here — the user hangs up manually when ready.
            if (transferMode === "cold") {
              if (focusedCall) {
                hangUpBySid(focusedCall.callSid);
              } else if (twilioActiveCall) {
                twilioActiveCall.disconnect();
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Drag operation failed:", error);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {/* Main content area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Incoming call banner - above agent grid */}
            <IncomingCallsArea
              organizationId={organizationId}
              convexOrgId={effectiveOrgId}
              currentUserId={effectiveUserId}
              twilioActiveCall={twilioActiveCall}
              twilioCallStatus={twilioCallStatus}
              onAnswerTwilio={answerCall}
              onRejectTwilio={rejectCall}
              pendingCalls={getPendingCalls()}
              connectedCallCount={callCount - getPendingCalls().length}
              onAnswerCallBySid={answerCallBySid}
              onRejectCallBySid={rejectCallBySid}
            />

            {/* Main agent grid + call log */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
              {/* Transfer mode toggle — applies to drag-and-drop transfers
                  between agents. Persists in localStorage. */}
              <div className="flex justify-end">
                <TransferModeToggle />
              </div>

              <AgentGrid
                organizationId={organizationId}
                convexOrgId={effectiveOrgId}
                currentUserId={effectiveUserId}
                twilioActiveCall={twilioActiveCall}
                onHangUp={hangUp}
                onToggleMute={toggleMute}
                onAnswerTwilio={answerCall}
                onRejectTwilio={rejectCall}
                // Multi-call props
                twilioCallsArray={getAllCalls()}
                focusedCallSid={focusedCallSid}
                onFocusCall={focusCall}
                onHoldCall={holdCall}
                onUnholdCall={unholdCall}
                onHangUpBySid={hangUpBySid}
                onAnswerCallBySid={answerCallBySid}
                onRejectCallBySid={rejectCallBySid}
              />

              {/* Daily Call Log */}
              {effectiveOrgId && (
                <div className="max-w-4xl">
                  <h3 className="text-sm font-medium text-on-surface-variant px-3 pb-2">
                    Today&apos;s Call Log
                  </h3>
                  <Card className={cn(cardPatterns.pageCard, "gap-0 py-0")}>
                    <CardContent className="p-0">
                      <DailyCallLog organizationId={effectiveOrgId!} />
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>

          {/* Parking lot sidebar — hidden below lg. Parking requires drag-
              and-drop which isn't practical on phones anyway; drag-drop
              devs/ops users will have desktop viewports. */}
          <aside className="hidden lg:block w-64 overflow-auto bg-surface-container-lowest">
            {effectiveOrgId && <ParkingLot organizationId={effectiveOrgId!} />}
          </aside>
        </div>
      </div>

      {/* Drag overlay - compact card that matches parking slot size */}
      <DragOverlay>
        {dragActiveCall ? (
          <div className="w-48 flex items-center gap-2 rounded-xl border-2 border-primary p-2 neu-ambient bg-white dark:bg-slate-900 cursor-grabbing">
            <GripVertical className="h-4 w-4 text-on-surface-variant flex-shrink-0" />
            <Phone className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-sm font-medium truncate flex-1">
              {dragActiveCall.fromName || dragActiveCall.from}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface IncomingCallsAreaProps {
  organizationId: string;
  convexOrgId?: Id<"organizations">;
  currentUserId?: Id<"users">;
  twilioActiveCall: any;
  twilioCallStatus: "pending" | "connecting" | "open" | "closed" | null;
  onAnswerTwilio: () => void;
  onRejectTwilio: () => void;
  // Multi-call props
  pendingCalls: any[];
  connectedCallCount: number;
  onAnswerCallBySid?: (callSid: string, holdOthers?: boolean) => Promise<boolean>;
  onRejectCallBySid?: (callSid: string) => void;
}

function IncomingCallsArea({
  organizationId,
  convexOrgId,
  currentUserId,
  twilioActiveCall,
  twilioCallStatus,
  onAnswerTwilio,
  onRejectTwilio,
  pendingCalls,
  connectedCallCount,
  onAnswerCallBySid,
  onRejectCallBySid,
}: IncomingCallsAreaProps) {
  // Query for active targeted ringing records
  const targetedRinging = useQuery(
    api.targetedRinging.getActiveForOrg,
    convexOrgId ? { organizationId: convexOrgId } : "skip"
  );

  const handleAnswer = useCallback(() => {
    console.log("Answer button clicked");
    onAnswerTwilio();
  }, [onAnswerTwilio]);

  const handleDecline = useCallback(() => {
    console.log("Decline button clicked, twilioCallStatus:", twilioCallStatus);
    onRejectTwilio();
  }, [onRejectTwilio, twilioCallStatus]);

  // Multi-call mode: Use pendingCalls array
  if (pendingCalls.length > 0) {
    // Filter out targeted calls (they show in user cards instead)
    // Check both by agentCallSid AND by whether current user is the target
    // (agentCallSid may not be set yet due to timing - call arrives before mutation completes)
    const nonTargetedCalls = pendingCalls.filter(call => {
      // Direct match by agentCallSid
      const isTargetedByCallSid = targetedRinging?.some(
        (tr) => tr.agentCallSid === call.callSid && tr.status === "ringing"
      );
      // If current user is the target of ANY ringing call, filter out their pending calls
      // This handles the race condition where agentCallSid isn't set yet
      const isTargetedToCurrentUser = currentUserId && targetedRinging?.some(
        (tr) => tr.targetUserId === currentUserId && tr.status === "ringing"
      );
      return !isTargetedByCallSid && !isTargetedToCurrentUser;
    });

    if (nonTargetedCalls.length === 0) return null;

    return (
      <div className="space-y-1">
        {nonTargetedCalls.map((callInfo) => (
          <IncomingCallPopup
            key={callInfo.callSid}
            call={{
              _id: callInfo.callSid,
              from: callInfo.from || "Unknown",
              fromName: undefined,
              startedAt: callInfo.startedAt,
            }}
            onAnswer={() => onAnswerCallBySid?.(callInfo.callSid, true)}
            onDecline={() => onRejectCallBySid?.(callInfo.callSid)}
            hasActiveCall={connectedCallCount > 0}
          />
        ))}
      </div>
    );
  }

  // Legacy single-call mode
  const isIncomingCall = twilioActiveCall &&
    twilioActiveCall.direction === "INCOMING" &&
    twilioCallStatus === "pending";

  if (!isIncomingCall) return null;

  // Check if this incoming call is targeted to a specific user
  // Check both by agentCallSid AND by whether current user is the target
  const incomingCallSid = twilioActiveCall.parameters?.CallSid;
  const isTargetedByCallSid = targetedRinging?.some(
    (tr) => tr.agentCallSid === incomingCallSid && tr.status === "ringing"
  );
  const isTargetedToCurrentUser = currentUserId && targetedRinging?.some(
    (tr) => tr.targetUserId === currentUserId && tr.status === "ringing"
  );

  if (isTargetedByCallSid || isTargetedToCurrentUser) {
    console.log(`Incoming call ${incomingCallSid} is targeted - hiding global banner`);
    return null;
  }

  return (
    <IncomingCallPopup
      call={{
        _id: twilioActiveCall.parameters?.CallSid || "unknown",
        from: twilioActiveCall.parameters?.From || "Unknown",
        fromName: undefined,
        startedAt: Date.now(),
      }}
      onAnswer={handleAnswer}
      onDecline={handleDecline}
    />
  );
}

interface AgentGridProps {
  organizationId: string;
  convexOrgId?: Id<"organizations">;
  currentUserId?: Id<"users">;
  twilioActiveCall?: any;
  onHangUp?: () => void;
  onToggleMute?: () => boolean;
  onAnswerTwilio?: () => void;
  onRejectTwilio?: () => void;
  // Multi-call props
  twilioCallsArray?: any[];
  focusedCallSid?: string | null;
  onFocusCall?: (callSid: string) => Promise<boolean>;
  onHoldCall?: (callSid: string) => Promise<boolean>;
  onUnholdCall?: (callSid: string) => Promise<boolean>;
  onHangUpBySid?: (callSid: string) => void;
  onAnswerCallBySid?: (callSid: string, holdOthers?: boolean) => Promise<boolean>;
  onRejectCallBySid?: (callSid: string) => void;
}

function AgentGrid({
  organizationId,
  convexOrgId,
  currentUserId,
  twilioActiveCall,
  onHangUp,
  onToggleMute,
  onAnswerTwilio,
  onRejectTwilio,
  twilioCallsArray,
  focusedCallSid,
  onFocusCall,
  onHoldCall,
  onUnholdCall,
  onHangUpBySid,
  onAnswerCallBySid,
  onRejectCallBySid,
}: AgentGridProps) {
  // Fetch users with their daily metrics from Convex
  const usersWithMetrics = useQuery(
    api.users.getByOrganizationWithMetrics,
    convexOrgId ? { organizationId: convexOrgId } : "skip"
  );

  // Fetch active calls to show on user cards
  const activeCalls = useQuery(
    api.calls.getActive,
    convexOrgId ? { organizationId: convexOrgId } : "skip"
  );

  // Show loading while fetching
  if (convexOrgId === undefined || usersWithMetrics === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading agents...
        </div>
      </div>
    );
  }

  if (!usersWithMetrics || usersWithMetrics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className={cn(cardPatterns.pageCard, "max-w-md")}>
          <CardContent className="pt-6 text-center">
            <Users className="mx-auto h-12 w-12 text-on-surface-variant" />
            <h3 className="mt-4 text-sm font-medium">No Agents Yet</h3>
            <p className="mt-2 text-sm text-on-surface-variant">
              Go to Settings → Users to add team members.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group active calls by assigned user.
  // Parked calls are intentionally excluded — they belong to the
  // parking lot widget, not to any agent's row. Showing them in
  // both places confused users into thinking the call was stuck on
  // their card with a non-functional hangup button.
  const callsByUser = new Map<string, typeof activeCalls>();
  if (activeCalls) {
    for (const call of activeCalls) {
      if (call.assignedUserId && call.state !== "parked") {
        const userId = call.assignedUserId;
        if (!callsByUser.has(userId)) {
          callsByUser.set(userId, []);
        }
        callsByUser.get(userId)!.push(call);
      }
    }
  }

  return (
    <div className="flex flex-col gap-3 max-w-4xl">
      {usersWithMetrics.map((user) => {
        // Pass Twilio call only to the current user's card
        const isCurrentUser = currentUserId && user._id === currentUserId;
        return (
          <UserStatusCard
            key={user._id}
            user={{
              id: user._id,
              clerkUserId: user.clerkUserId,
              name: user.name,
              status: user.status,
              avatarUrl: user.avatarUrl || null,
            }}
            todayMetrics={user.todayMetrics}
            activeCalls={callsByUser.get(user._id) || []}
            twilioActiveCall={isCurrentUser ? twilioActiveCall : undefined}
            onHangUp={isCurrentUser ? onHangUp : undefined}
            onToggleMute={isCurrentUser ? onToggleMute : undefined}
            onAnswerTwilio={isCurrentUser ? onAnswerTwilio : undefined}
            onRejectTwilio={isCurrentUser ? onRejectTwilio : undefined}
            // Multi-call props (only for current user)
            twilioCallsArray={isCurrentUser ? twilioCallsArray : undefined}
            focusedCallSid={isCurrentUser ? focusedCallSid : undefined}
            onFocusCall={isCurrentUser ? onFocusCall : undefined}
            onHoldCall={isCurrentUser ? onHoldCall : undefined}
            onUnholdCall={isCurrentUser ? onUnholdCall : undefined}
            onHangUpBySid={isCurrentUser ? onHangUpBySid : undefined}
            onAnswerCallBySid={isCurrentUser ? onAnswerCallBySid : undefined}
            onRejectCallBySid={isCurrentUser ? onRejectCallBySid : undefined}
          />
        );
      })}
    </div>
  );
}
