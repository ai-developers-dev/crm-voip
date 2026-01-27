"use client";

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTwilioDevice, CallInfo, CallStatus } from "@/hooks/use-twilio-device";
import { Id } from "../../../convex/_generated/dataModel";
import { Call, Device } from "@twilio/voice-sdk";

export interface CallingContextValue {
  // Connection state
  isReady: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  error: string | null;
  device: Device | null;

  // Multi-call state
  calls: Map<string, CallInfo>;
  focusedCallSid: string | null;
  callCount: number;

  // Legacy single-call interface (for backward compatibility)
  activeCall: Call | null;
  callStatus: CallStatus | null;

  // Getters
  getAllCalls: () => CallInfo[];
  getPendingCalls: () => CallInfo[];
  getActiveCalls: () => CallInfo[];

  // Core operations
  initializeDevice: () => Promise<void>;
  makeCall: (to: string) => Promise<Call | null>;

  // Answer operations
  answerCall: () => Promise<boolean | undefined>;
  answerCallBySid: (callSid: string, holdOthers?: boolean) => Promise<boolean>;

  // Reject operations
  rejectCall: () => void;
  rejectCallBySid: (callSid: string) => void;

  // Hang up operations
  hangUp: () => void;
  hangUpBySid: (callSid: string) => void;

  // Hold operations
  holdCall: (callSid: string) => Promise<boolean>;
  unholdCall: (callSid: string) => Promise<boolean>;
  focusCall: (callSid: string) => Promise<boolean>;

  // Mute operations
  toggleMute: () => boolean;
  toggleMuteBySid: (callSid: string) => boolean;

  // Max calls setting
  maxConcurrentCalls: number;

  // Organization data
  convexOrgId: Id<"organizations"> | undefined;
  currentUserId: Id<"users"> | undefined;
  clerkOrgId: string | undefined;
}

const CallingContext = createContext<CallingContextValue | null>(null);

export function useCallingContext() {
  const context = useContext(CallingContext);
  if (!context) {
    throw new Error("useCallingContext must be used within a CallingProvider");
  }
  return context;
}

// Optional hook that returns null when outside provider (for conditional usage)
export function useOptionalCallingContext() {
  return useContext(CallingContext);
}

interface CallingProviderProps {
  children: ReactNode;
  organizationId: string; // Clerk org ID
  maxConcurrentCalls?: number;
}

export function CallingProvider({
  children,
  organizationId,
  maxConcurrentCalls: maxCallsProp,
}: CallingProviderProps) {
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

  // Get max concurrent calls from org settings (default 3)
  const maxConcurrentCalls = maxCallsProp ?? convexOrg?.settings?.maxConcurrentCalls ?? 3;

  // Initialize Twilio Device with multi-call support
  const twilioDevice = useTwilioDevice(maxConcurrentCalls);

  // Convex mutations
  const createOrGetIncomingCall = useMutation(api.calls.createOrGetIncoming);
  const heartbeat = useMutation(api.presence.heartbeat);

  // Presence heartbeat - runs every 30 seconds
  useEffect(() => {
    if (!currentUser?._id || !convexOrg?._id) return;

    // Determine status based on call count
    const getStatus = () => {
      if (twilioDevice.callCount > 0) return "on_call";
      return "available";
    };

    // Initial heartbeat
    heartbeat({
      userId: currentUser._id,
      organizationId: convexOrg._id,
      status: getStatus(),
      deviceInfo: {
        browser:
          typeof navigator !== "undefined"
            ? navigator.userAgent.split(" ").pop() || "Unknown"
            : "Unknown",
        os: typeof navigator !== "undefined" ? navigator.platform : "Unknown",
      },
    });

    // Heartbeat interval
    const interval = setInterval(() => {
      heartbeat({
        userId: currentUser._id,
        organizationId: convexOrg._id,
        status: getStatus(),
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [currentUser?._id, convexOrg?._id, heartbeat, twilioDevice.callCount]);

  // Handle incoming Twilio calls - sync all to Convex
  useEffect(() => {
    if (!convexOrg?._id) return;

    const allCalls = twilioDevice.getAllCalls();
    for (const callInfo of allCalls) {
      if (callInfo.direction === "INCOMING") {
        createOrGetIncomingCall({
          organizationId: convexOrg._id,
          twilioCallSid: callInfo.callSid,
          from: callInfo.from,
          to: callInfo.to,
        }).catch(console.error);
      }
    }
  }, [twilioDevice.getAllCalls, convexOrg?._id, createOrGetIncomingCall]);

  const contextValue: CallingContextValue = {
    // Connection state
    isReady: twilioDevice.isReady,
    isConnecting: twilioDevice.isConnecting,
    isReconnecting: twilioDevice.isReconnecting,
    error: twilioDevice.error,
    device: twilioDevice.device,

    // Multi-call state
    calls: twilioDevice.calls,
    focusedCallSid: twilioDevice.focusedCallSid,
    callCount: twilioDevice.callCount,

    // Legacy single-call interface
    activeCall: twilioDevice.activeCall,
    callStatus: twilioDevice.callStatus,

    // Getters
    getAllCalls: twilioDevice.getAllCalls,
    getPendingCalls: twilioDevice.getPendingCalls,
    getActiveCalls: twilioDevice.getActiveCalls,

    // Core operations
    initializeDevice: twilioDevice.initializeDevice,
    makeCall: twilioDevice.makeCall,

    // Answer operations
    answerCall: twilioDevice.answerCall,
    answerCallBySid: twilioDevice.answerCallBySid,

    // Reject operations
    rejectCall: twilioDevice.rejectCall,
    rejectCallBySid: twilioDevice.rejectCallBySid,

    // Hang up operations
    hangUp: twilioDevice.hangUp,
    hangUpBySid: twilioDevice.hangUpBySid,

    // Hold operations
    holdCall: twilioDevice.holdCall,
    unholdCall: twilioDevice.unholdCall,
    focusCall: twilioDevice.focusCall,

    // Mute operations
    toggleMute: twilioDevice.toggleMute,
    toggleMuteBySid: twilioDevice.toggleMuteBySid,

    // Max calls setting
    maxConcurrentCalls,

    // Organization data
    convexOrgId: convexOrg?._id,
    currentUserId: currentUser?._id,
    clerkOrgId: organizationId,
  };

  return (
    <CallingContext.Provider value={contextValue}>
      {children}
    </CallingContext.Provider>
  );
}
