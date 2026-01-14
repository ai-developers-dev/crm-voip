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
import { useTwilioDevice } from "@/hooks/use-twilio-device";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { useParkingStore, generateTempParkingId } from "@/lib/stores/parking-store";

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

  // Get the Convex organization from Clerk org ID
  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organizationId ? { clerkOrgId: organizationId } : "skip"
  );

  // Get current user
  const currentUser = useQuery(
    api.users.getCurrentByOrg,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  // Initialize Twilio Device
  const {
    isReady: twilioReady,
    activeCall: twilioActiveCall,
    callStatus: twilioCallStatus,
    error: twilioError,
    answerCall,
    rejectCall,
    hangUp,
    toggleMute,
  } = useTwilioDevice();

  // Convex mutations
  const createOrGetIncomingCall = useMutation(api.calls.createOrGetIncoming);
  const endCallMutation = useMutation(api.calls.end);
  const heartbeat = useMutation(api.presence.heartbeat);
  const createTargetedRinging = useMutation(api.targetedRinging.create);

  // Parking store for optimistic updates
  const addOptimisticCall = useParkingStore((s) => s.addOptimisticCall);
  const removeOptimisticCall = useParkingStore((s) => s.removeOptimisticCall);
  const setParkingInProgress = useParkingStore((s) => s.setParkingInProgress);

  // Presence heartbeat - runs every 30 seconds
  useEffect(() => {
    if (!currentUser?._id || !convexOrg?._id) return;

    // Initial heartbeat
    heartbeat({
      userId: currentUser._id,
      organizationId: convexOrg._id,
      status: "available",
      deviceInfo: {
        browser: typeof navigator !== "undefined" ? navigator.userAgent.split(" ").pop() || "Unknown" : "Unknown",
        os: typeof navigator !== "undefined" ? navigator.platform : "Unknown",
      },
    });

    // Heartbeat interval
    const interval = setInterval(() => {
      heartbeat({
        userId: currentUser._id,
        organizationId: convexOrg._id,
        status: twilioActiveCall ? "on_call" : "available",
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [currentUser?._id, convexOrg?._id, heartbeat, twilioActiveCall]);

  // Handle incoming Twilio call - sync to Convex
  useEffect(() => {
    if (twilioActiveCall && convexOrg?._id) {
      const params = twilioActiveCall.parameters;
      if (params?.CallSid && params?.From && params?.To) {
        createOrGetIncomingCall({
          organizationId: convexOrg._id,
          twilioCallSid: params.CallSid,
          from: params.From,
          to: params.To,
        }).catch(console.error);
      }
    }
  }, [twilioActiveCall, convexOrg?._id, createOrGetIncomingCall]);

  // For now, show a placeholder since we need Convex organization ID
  if (!organizationId) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Phone className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No Organization Selected</h3>
            <p className="mt-2 text-sm text-muted-foreground">
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
        console.log("🚗 PARKING CALL - drop detected on parking-lot");

        // Use twilioActiveCall directly from hook (like working app)
        if (!twilioActiveCall) {
          console.error("No active call to park");
          return;
        }

        if (!convexOrg?._id) {
          console.error("No organization ID available for parking");
          return;
        }

        // Get call info directly from Twilio SDK call
        const callSid = twilioActiveCall.parameters.CallSid;
        const callerNumber = twilioActiveCall.parameters.From || "Unknown";
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
          parkedByUserId: currentUser?._id,
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
              organizationId: convexOrg._id,
              parkedByUserId: currentUser?._id,
            }),
          });

          if (!holdResponse.ok) {
            const error = await holdResponse.json();
            console.error("❌ Failed to park call - Status:", holdResponse.status);
            console.error("❌ Error details:", JSON.stringify(error, null, 2));
            alert(`Failed to park call: ${error.details || error.error || 'Unknown error'}`);
            removeOptimisticCall(tempId);
            setParkingInProgress(null);
            return;
          }

          const holdResult = await holdResponse.json();
          console.log(`✅ Call parked successfully:`, holdResult);
        } finally {
          // Step 3: Remove optimistic entry (real one arrives via Convex subscription)
          removeOptimisticCall(tempId);
          setParkingInProgress(null);
        }

        // Step 4: The browser SDK call will disconnect automatically when the PSTN
        // parent call is redirected to the conference. We don't need to manually
        // disconnect it - this matches the working app pattern.
        // The Twilio status callback will handle cleanup.
        console.log("Waiting for browser SDK call to disconnect naturally...");

        // NOTE: If the call doesn't disconnect naturally within a few seconds,
        // we may need to disconnect it manually. But try natural first.
        // if (twilioActiveCall) {
        //   twilioActiveCall.disconnect();
        // }
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
          // This tells the UI to show ringing only in this user's card
          if (convexOrg?._id) {
            try {
              await createTargetedRinging({
                organizationId: convexOrg._id,
                targetUserId: targetConvexUserId,
                callerNumber,
                callerName,
                pstnCallSid,
              });
              console.log(`🔔 Created targeted ringing for ${callerNumber} -> ${targetUser.name}`);
            } catch (e) {
              console.error("Failed to create targeted ringing record:", e);
            }
          }

          // Build the correct Twilio identity: orgId-userId (matches token generation)
          const targetTwilioIdentity = `${organizationId}-${targetUser.clerkUserId}`;
          console.log(`📞 UNPARKING: ${pstnCallSid} -> ${targetUser.name} (identity: ${targetTwilioIdentity})`);

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
            console.log("✅ Call unparked successfully:", result);
            // The parking slot will be cleared when the conference ends (participant-leave event)
          }
        } else {
          // TRANSFER: Transfer active call to another user
          const callSid = twilioActiveCall?.parameters?.CallSid;

          if (!callSid) {
            console.error("Twilio call SID not found for transfer");
            return;
          }

          // Build the correct Twilio identity: orgId-userId (matches token generation)
          const targetTwilioIdentity = `${organizationId}-${targetUser.clerkUserId}`;
          console.log(`Initiating transfer: ${callSid} -> ${targetUser.name} (identity: ${targetTwilioIdentity})`);

          const transferResponse = await fetch("/api/twilio/transfer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              twilioCallSid: callSid,
              targetUserId: targetId,
              targetIdentity: targetTwilioIdentity,
              type: "direct",
              sourceUserId: currentUser?._id,
            }),
          });

          if (!transferResponse.ok) {
            const error = await transferResponse.json();
            console.error("Transfer failed:", error);
          } else {
            const result = await transferResponse.json();
            console.log("Transfer initiated:", result);

            // Disconnect local Twilio SDK call - caller is now on hold music
            // The target agent will receive a new incoming call
            if (twilioActiveCall) {
              twilioActiveCall.disconnect();
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
        {/* Status bar */}
        <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {twilioReady ? (
              <Badge variant="default" className="gap-1 bg-green-600">
                <Wifi className="h-3 w-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <WifiOff className="h-3 w-3" />
                Connecting...
              </Badge>
            )}
            {twilioError && (
              <span className="text-sm text-destructive">{twilioError}</span>
            )}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Main content area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Incoming call banner - above agent grid */}
            <IncomingCallsArea
              organizationId={organizationId}
              convexOrgId={convexOrg?._id}
              currentUserId={currentUser?._id}
              twilioActiveCall={twilioActiveCall}
              twilioCallStatus={twilioCallStatus}
              onAnswerTwilio={answerCall}
              onRejectTwilio={rejectCall}
            />

            {/* Main agent grid */}
            <div className="flex-1 overflow-auto p-4">
              <AgentGrid
                organizationId={organizationId}
                convexOrgId={convexOrg?._id}
                currentUserId={currentUser?._id}
                twilioActiveCall={twilioActiveCall}
                onHangUp={hangUp}
                onToggleMute={toggleMute}
                onAnswerTwilio={answerCall}
                onRejectTwilio={rejectCall}
              />
            </div>
          </div>

          {/* Parking lot sidebar */}
          <aside className="w-64 border-l bg-muted/30 overflow-auto">
            {convexOrg?._id && <ParkingLot organizationId={convexOrg._id} />}
          </aside>
        </div>
      </div>

      {/* Drag overlay - matches parking slot dimensions */}
      <DragOverlay>
        {dragActiveCall ? (
          <div className="w-56 flex items-center gap-3 rounded-md border p-3 shadow-lg bg-primary/10 dark:bg-primary/20 cursor-grabbing">
            <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-semibold flex-shrink-0">
              <Phone className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium truncate block">
                {dragActiveCall.fromName || dragActiveCall.from}
              </span>
              <p className="text-xs text-muted-foreground">Drop to park</p>
            </div>
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
}

function IncomingCallsArea({
  organizationId,
  convexOrgId,
  currentUserId,
  twilioActiveCall,
  twilioCallStatus,
  onAnswerTwilio,
  onRejectTwilio,
}: IncomingCallsAreaProps) {
  // Query for active targeted ringing records
  // If this call is targeted to a specific user, don't show global banner
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

  // Only show if call status is "pending" (ringing)
  const isIncomingCall = twilioActiveCall &&
    twilioActiveCall.direction === "INCOMING" &&
    twilioCallStatus === "pending";

  if (!isIncomingCall) return null;

  // Check if this incoming call is targeted to a specific user
  // If so, don't show the global banner - it will show in the user's card instead
  const callerNumber = twilioActiveCall.parameters?.From;
  const isTargetedCall = targetedRinging?.some(
    (tr) => tr.callerNumber === callerNumber && tr.status === "ringing"
  );

  if (isTargetedCall) {
    console.log(`📞 Incoming call from ${callerNumber} is targeted - hiding global banner`);
    return null;
  }

  return (
    <IncomingCallPopup
      call={{
        _id: twilioActiveCall.parameters?.CallSid || "unknown",
        from: callerNumber || "Unknown",
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
}

function AgentGrid({ organizationId, convexOrgId, currentUserId, twilioActiveCall, onHangUp, onToggleMute, onAnswerTwilio, onRejectTwilio }: AgentGridProps) {
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
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading agents...
        </div>
      </div>
    );
  }

  if (!usersWithMetrics || usersWithMetrics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Users className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No Agents Yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Go to Settings → Users to add team members.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group active calls by assigned user
  const callsByUser = new Map<string, typeof activeCalls>();
  if (activeCalls) {
    for (const call of activeCalls) {
      if (call.assignedUserId) {
        const userId = call.assignedUserId;
        if (!callsByUser.has(userId)) {
          callsByUser.set(userId, []);
        }
        callsByUser.get(userId)!.push(call);
      }
    }
  }

  return (
    <div className="flex flex-col gap-2 max-w-4xl">
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
          />
        );
      })}
    </div>
  );
}
