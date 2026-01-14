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
import { Phone, Users, Wifi, WifiOff, Loader2 } from "lucide-react";
import { useTwilioDevice } from "@/hooks/use-twilio-device";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";

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
  const parkCallMutation = useMutation(api.calls.park);
  const heartbeat = useMutation(api.presence.heartbeat);

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

    const callId = active.id as string;
    const callData = active.data.current?.call;
    const twilioCallSid = callData?.twilioCallSid || twilioActiveCall?.parameters?.CallSid;
    const targetType = over.data.current?.type;
    const targetId = over.id as string;

    try {
      if (targetType === "parking-slot") {
        // Park the call with hold music
        const slotNumber = parseInt(targetId.replace("parking-", ""));

        // Step 1: Put call on hold via Twilio REST API (plays hold music)
        if (twilioCallSid) {
          console.log(`Putting call ${twilioCallSid} on hold before parking`);
          const holdResponse = await fetch("/api/twilio/hold", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ twilioCallSid }),
          });

          if (!holdResponse.ok) {
            const error = await holdResponse.json();
            console.error("Failed to put call on hold:", error);
            // Continue with DB update even if Twilio fails
          }
        }

        // Step 2: Update database state
        await parkCallMutation({
          callId: callId as Id<"activeCalls">,
          slotNumber,
        });

        // Step 3: Disconnect local Twilio SDK call (caller is now on hold music)
        if (twilioActiveCall) {
          twilioActiveCall.disconnect();
        }
      } else if (targetType === "user") {
        // Transfer the call to another user with ringing
        const targetUser = over.data.current?.user;
        const sourceType = active.data.current?.type;
        const isFromParking = sourceType === "parked-call";
        const parkingSlot = active.data.current?.slotNumber;

        if (!targetUser?.clerkUserId) {
          console.error("Target user clerkUserId not found");
          return;
        }

        if (!twilioCallSid) {
          console.error("Twilio call SID not found for transfer");
          return;
        }

        console.log(`Initiating transfer: ${twilioCallSid} -> ${targetUser.name} (${targetUser.clerkUserId})`);

        const transferResponse = await fetch("/api/twilio/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            twilioCallSid,
            activeCallId: callId,
            targetUserId: targetId,
            targetIdentity: targetUser.clerkUserId,
            type: isFromParking ? "from_park" : "direct",
            returnToParkSlot: isFromParking ? parkingSlot : undefined,
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
          if (twilioActiveCall && !isFromParking) {
            twilioActiveCall.disconnect();
          }
        }
      }
    } catch (error) {
      console.error("Drag operation failed:", error);
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
              />
            </div>
          </div>

          {/* Parking lot sidebar */}
          <aside className="w-64 border-l bg-muted/30 overflow-auto">
            {convexOrg?._id && <ParkingLot organizationId={convexOrg._id} />}
          </aside>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {dragActiveCall ? (
          <div className="rounded-lg border bg-background p-3 shadow-lg">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <span className="font-medium">{dragActiveCall.from}</span>
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
  // SIMPLIFIED: Only use Twilio SDK for incoming call display
  // This prevents duplicates - Twilio SDK is the single source of truth
  // Convex is only used for call history/claiming, not for UI display

  const handleAnswer = useCallback(() => {
    console.log("Answer button clicked");
    // Answer in Twilio SDK - this is all we need
    // The claim happens in the background via use-twilio-device hook
    onAnswerTwilio();
  }, [onAnswerTwilio]);

  const handleDecline = useCallback(() => {
    console.log("Decline button clicked, twilioCallStatus:", twilioCallStatus);
    onRejectTwilio();
  }, [onRejectTwilio, twilioCallStatus]);

  // Only show if call status is "pending" (ringing) - this is reactive state
  // When call is accepted, callStatus changes to "open" and this will hide
  const isIncomingCall = twilioActiveCall &&
    twilioActiveCall.direction === "INCOMING" &&
    twilioCallStatus === "pending";

  if (!isIncomingCall) return null;

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
}

function AgentGrid({ organizationId, convexOrgId, currentUserId, twilioActiveCall, onHangUp, onToggleMute }: AgentGridProps) {
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
          />
        );
      })}
    </div>
  );
}
