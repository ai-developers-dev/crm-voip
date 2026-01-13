"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { UserStatusCard } from "./user-status-card";
import { IncomingCallPopup } from "./incoming-call-popup";
import { ParkingLot } from "./parking-lot";
import { ActiveCallCard } from "./active-call-card";
import { DndContext, DragEndEvent, DragOverlay } from "@dnd-kit/core";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Phone, Users, Wifi, WifiOff, Loader2 } from "lucide-react";
import { useTwilioDevice } from "@/hooks/use-twilio-device";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";

interface CallingDashboardProps {
  organizationId?: string;
  viewMode?: "normal" | "admin"; // admin mode = viewing as platform admin
}

export function CallingDashboard({ organizationId, viewMode = "normal" }: CallingDashboardProps) {
  const [activeCall, setActiveCall] = useState<any>(null);

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
    error: twilioError,
    answerCall,
    rejectCall,
    hangUp,
    toggleMute,
  } = useTwilioDevice();

  // Convex mutations
  const createOrGetIncomingCall = useMutation(api.calls.createOrGetIncoming);
  const answerCallMutation = useMutation(api.calls.answer);
  const endCallMutation = useMutation(api.calls.end);
  const parkCallMutation = useMutation(api.calls.park);
  const transferCallMutation = useMutation(api.calls.transfer);
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
    setActiveCall(event.active.data.current?.call);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCall(null);

    if (!over) return;

    const callId = active.id as string;
    const targetType = over.data.current?.type;
    const targetId = over.id as string;

    try {
      if (targetType === "parking-slot") {
        // Park the call
        const slotNumber = parseInt(targetId.replace("slot-", ""));
        await parkCallMutation({
          callId: callId as Id<"activeCalls">,
          slotNumber,
        });
      } else if (targetType === "user") {
        // Transfer the call
        await transferCallMutation({
          callId: callId as Id<"activeCalls">,
          targetUserId: targetId as Id<"users">,
        });
      }
    } catch (error) {
      console.error("Drag operation failed:", error);
    }
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
          {/* Incoming calls overlay */}
          <IncomingCallsArea
            organizationId={organizationId}
            convexOrgId={convexOrg?._id}
            currentUserId={currentUser?._id}
            twilioActiveCall={twilioActiveCall}
            onAnswerTwilio={answerCall}
            onRejectTwilio={rejectCall}
          />

          {/* Main agent grid */}
          <div className="flex-1 overflow-auto p-4">
            <AgentGrid
              organizationId={organizationId}
              convexOrgId={convexOrg?._id}
            />
          </div>

          {/* Parking lot sidebar */}
          <aside className="w-64 border-l bg-muted/30 overflow-auto">
            {convexOrg?._id && <ParkingLot organizationId={convexOrg._id} />}
          </aside>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeCall ? (
          <div className="rounded-lg border bg-background p-3 shadow-lg">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <span className="font-medium">{activeCall.from}</span>
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
  onAnswerTwilio: () => void;
  onRejectTwilio: () => void;
}

function IncomingCallsArea({
  organizationId,
  convexOrgId,
  currentUserId,
  twilioActiveCall,
  onAnswerTwilio,
  onRejectTwilio,
}: IncomingCallsAreaProps) {
  // Query ringing calls from Convex
  const ringingCalls = useQuery(
    api.calls.getRinging,
    convexOrgId ? { organizationId: convexOrgId } : "skip"
  );

  const answerCallMutation = useMutation(api.calls.answer);

  const handleAnswer = useCallback(async (callId: Id<"activeCalls">) => {
    if (!currentUserId) return;

    try {
      // Answer in Twilio SDK
      onAnswerTwilio();

      // Update Convex
      await answerCallMutation({
        callId,
        userId: currentUserId,
      });
    } catch (error) {
      console.error("Failed to answer call:", error);
    }
  }, [currentUserId, onAnswerTwilio, answerCallMutation]);

  const handleDecline = useCallback(async () => {
    try {
      // Reject in Twilio SDK
      onRejectTwilio();
    } catch (error) {
      console.error("Failed to decline call:", error);
    }
  }, [onRejectTwilio]);

  // If no ringing calls but there's a Twilio incoming call, show it
  const incomingCalls = ringingCalls ?? [];

  // Also check for Twilio SDK incoming call that might not be in Convex yet
  const hasUnregisteredTwilioCall = twilioActiveCall &&
    twilioActiveCall.direction === "INCOMING" &&
    !incomingCalls.some(c => c.twilioCallSid === twilioActiveCall.parameters?.CallSid);

  if (incomingCalls.length === 0 && !hasUnregisteredTwilioCall) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 space-y-2">
      {incomingCalls.map((call) => (
        <IncomingCallPopup
          key={call._id}
          call={call}
          onAnswer={() => handleAnswer(call._id)}
          onDecline={handleDecline}
        />
      ))}
      {/* Show Twilio call that's not yet in Convex */}
      {hasUnregisteredTwilioCall && (
        <IncomingCallPopup
          call={{
            _id: twilioActiveCall.parameters?.CallSid || "unknown",
            from: twilioActiveCall.parameters?.From || "Unknown",
            fromName: undefined,
            startedAt: Date.now(),
          }}
          onAnswer={onAnswerTwilio}
          onDecline={onRejectTwilio}
        />
      )}
    </div>
  );
}

interface AgentGridProps {
  organizationId: string;
  convexOrgId?: Id<"organizations">;
}

function AgentGrid({ organizationId, convexOrgId }: AgentGridProps) {
  // Fetch real users from Convex
  const users = useQuery(
    api.users.getByOrganization,
    convexOrgId ? { organizationId: convexOrgId } : "skip"
  );

  // Fetch active calls to show on user cards
  const activeCalls = useQuery(
    api.calls.getActive,
    convexOrgId ? { organizationId: convexOrgId } : "skip"
  );

  // Show loading while fetching
  if (convexOrgId === undefined || users === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading agents...
        </div>
      </div>
    );
  }

  if (!users || users.length === 0) {
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {users.map((user) => (
        <UserStatusCard
          key={user._id}
          user={{
            id: user._id,
            name: user.name,
            status: user.status,
            avatarUrl: user.avatarUrl || null,
          }}
          activeCalls={callsByUser.get(user._id) || []}
        />
      ))}
    </div>
  );
}
