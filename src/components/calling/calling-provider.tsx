"use client";

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useRef,
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

  // Optimistic-hangup tracking — populated by useTwilioDevice when the
  // local removeCall fires. UserStatusCard's DB-fallback render block
  // filters activeCalls rows whose twilioCallSid OR childCallSid is in
  // this set, so the call card doesn't flicker between local removal
  // and the Convex subscription update. Entries auto-expire after 5s.
  recentlyHungUpSids: Set<string>;

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
  const heartbeat = useMutation(api.presence.heartbeat);

  // Track call count in a ref so heartbeat doesn't restart on every call change
  const callCountRef = useRef(twilioDevice.callCount);
  callCountRef.current = twilioDevice.callCount;

  // Presence heartbeat - runs every 30 seconds (stable deps, no re-render cascade)
  useEffect(() => {
    if (!currentUser?._id || !convexOrg?._id) return;

    const getStatus = () => (callCountRef.current > 0 ? "on_call" : "available");

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
  }, [currentUser?._id, convexOrg?._id, heartbeat]);

  // NOTE: we intentionally do NOT create an activeCalls row from the browser.
  // The voice webhook creates the authoritative PSTN-leg record via
  // api.calls.createOrGetIncomingFromWebhook. Creating per-agent-leg rows
  // here produced duplicate call log entries (one per ring_all agent) with
  // the wrong "from" value — the Twilio number instead of the real caller.
  // claimCall falls back to matching by org+state="ringing" when the agent
  // leg's SID doesn't match, so the PSTN record is enough.

  // ── Far-end-hangup watchdog ──────────────────────────────────────
  // When the remote party hangs up (e.g. cell phone hits "End"),
  // Twilio's status webhook fires and updateStatusHandler deletes
  // the activeCalls row. The browser SDK SHOULD also fire its
  // `disconnect` event for the parent leg, but in some scenarios
  // (network blips, page focus loss, Twilio race) the SDK event
  // never lands and the call card stays on screen with a stale
  // local SDK call object behind it.
  //
  // We use the live `getActive` Convex subscription as a watchdog:
  // any local SDK call whose Twilio SID isn't in the current
  // activeCalls list anymore is presumed dead — we tear down the
  // local call object and kick it out of state. The disposition
  // dialog still works because end-call's storeRecording writes
  // the callHistory row first.
  const activeCallsForWatchdog = useQuery(
    api.calls.getActive,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip",
  );
  useEffect(() => {
    if (!activeCallsForWatchdog) return;
    if (twilioDevice.calls.size === 0) return;

    // Build a set of every SID that's still alive in the DB.
    const aliveSids = new Set<string>();
    for (const c of activeCallsForWatchdog) {
      aliveSids.add(c.twilioCallSid);
      if (c.childCallSid) aliveSids.add(c.childCallSid);
      if (c.pstnCallSid) aliveSids.add(c.pstnCallSid);
    }

    for (const [callSid, callInfo] of twilioDevice.calls) {
      // Skip pending (still-ringing) calls — those wouldn't have a
      // DB row yet anyway, and tearing them down would race with
      // the answer/claim flow.
      if (callInfo.status === "pending") continue;
      // Skip if the call is connecting (outbound dialing) — give
      // it a few seconds to land in the DB.
      if (callInfo.status === "connecting") continue;
      // The Twilio Call object exposes its current SID via
      // parameters.CallSid once Twilio has assigned one. Use that
      // alongside the stored callSid (which can still be the
      // out-… placeholder until rekey lands).
      const liveSid = callInfo.call.parameters?.CallSid;
      const sids = [callSid, liveSid].filter(Boolean) as string[];
      const stillAlive = sids.some((s) => aliveSids.has(s));
      if (!stillAlive) {
        console.log(
          `[watchdog] local call ${callSid} no longer in activeCalls — clearing UI`,
        );
        try {
          callInfo.call.disconnect();
        } catch {
          // already disconnected, ignore
        }
        twilioDevice.hangUpBySid(callSid);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCallsForWatchdog]);

  const contextValue: CallingContextValue = useMemo(() => ({
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

    // Optimistic-hangup tracking (see CallingContextValue comment)
    recentlyHungUpSids: twilioDevice.recentlyHungUpSids,

    // Organization data
    convexOrgId: convexOrg?._id,
    currentUserId: currentUser?._id,
    clerkOrgId: organizationId,
  }), [
    twilioDevice.isReady, twilioDevice.isConnecting, twilioDevice.isReconnecting,
    twilioDevice.error, twilioDevice.device,
    twilioDevice.calls, twilioDevice.focusedCallSid, twilioDevice.callCount,
    twilioDevice.activeCall, twilioDevice.callStatus,
    twilioDevice.getAllCalls, twilioDevice.getPendingCalls, twilioDevice.getActiveCalls,
    twilioDevice.initializeDevice, twilioDevice.makeCall,
    twilioDevice.answerCall, twilioDevice.answerCallBySid,
    twilioDevice.rejectCall, twilioDevice.rejectCallBySid,
    twilioDevice.hangUp, twilioDevice.hangUpBySid,
    twilioDevice.holdCall, twilioDevice.unholdCall, twilioDevice.focusCall,
    twilioDevice.toggleMute, twilioDevice.toggleMuteBySid,
    twilioDevice.recentlyHungUpSids,
    maxConcurrentCalls, convexOrg?._id, currentUser?._id, organizationId,
  ]);

  return (
    <CallingContext.Provider value={contextValue}>
      {children}
    </CallingContext.Provider>
  );
}
