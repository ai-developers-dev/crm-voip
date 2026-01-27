"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Device, Call } from "@twilio/voice-sdk";
import { useUser, useOrganization } from "@clerk/nextjs";

export type CallStatus = "pending" | "connecting" | "open" | "closed";

export interface CallInfo {
  call: Call;
  callSid: string;
  status: CallStatus;
  direction: "INCOMING" | "OUTGOING";
  from: string;
  to: string;
  isHeld: boolean;
  isMuted: boolean;
  startedAt: number;
  answeredAt?: number;
}

export interface TwilioDeviceState {
  device: Device | null;
  isReady: boolean;
  isConnecting: boolean;
  // Multi-call state
  calls: Map<string, CallInfo>;
  focusedCallSid: string | null;
  // Legacy single-call interface (for backward compatibility)
  activeCall: Call | null;
  callStatus: CallStatus | null;
  error: string | null;
}

// Default max concurrent calls (can be overridden by org settings)
const DEFAULT_MAX_CONCURRENT_CALLS = 3;

export function useTwilioDevice(maxConcurrentCalls: number = DEFAULT_MAX_CONCURRENT_CALLS) {
  const { user } = useUser();
  const { organization } = useOrganization();
  const [state, setState] = useState<TwilioDeviceState>({
    device: null,
    isReady: false,
    isConnecting: false,
    calls: new Map(),
    focusedCallSid: null,
    activeCall: null,
    callStatus: null,
    error: null,
  });
  const deviceRef = useRef<Device | null>(null);

  // Fetch token with retry logic and exponential backoff
  const fetchTokenWithRetry = useCallback(async (maxRetries = 3): Promise<string | null> => {
    if (!user || !organization) return null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch("/api/twilio/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identity: `${organization.id}-${user.id}`,
          }),
        });

        if (response.ok) {
          const { token } = await response.json();
          return token;
        }

        // Client error (4xx) - don't retry
        if (response.status >= 400 && response.status < 500) {
          console.error(`Token request failed with status ${response.status}`);
          return null;
        }

        // Server error (5xx) - retry with backoff
        console.warn(`Token request failed (attempt ${attempt + 1}/${maxRetries}), retrying...`);
      } catch (error) {
        console.error(`Token fetch error (attempt ${attempt + 1}/${maxRetries}):`, error);
      }

      // Don't sleep after the last attempt
      if (attempt < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.error("Failed to fetch Twilio token after all retries");
    return null;
  }, [user, organization]);

  // Simple fetch for backward compatibility
  const fetchToken = useCallback(async () => {
    return fetchTokenWithRetry(1);
  }, [fetchTokenWithRetry]);

  // Helper to update call info in state
  const updateCallInfo = useCallback((callSid: string, updates: Partial<CallInfo>) => {
    setState((prev) => {
      const newCalls = new Map(prev.calls);
      const existing = newCalls.get(callSid);
      if (existing) {
        newCalls.set(callSid, { ...existing, ...updates });
      }

      // Update legacy activeCall if this is the focused call
      let activeCall = prev.activeCall;
      let callStatus = prev.callStatus;
      if (callSid === prev.focusedCallSid) {
        const updated = newCalls.get(callSid);
        activeCall = updated?.call || null;
        callStatus = updated?.status || null;
      }

      return { ...prev, calls: newCalls, activeCall, callStatus };
    });
  }, []);

  // Helper to remove call from state
  const removeCall = useCallback((callSid: string) => {
    setState((prev) => {
      const newCalls = new Map(prev.calls);
      newCalls.delete(callSid);

      // Update focused call if the removed call was focused
      let focusedCallSid = prev.focusedCallSid;
      let activeCall = prev.activeCall;
      let callStatus = prev.callStatus;

      if (callSid === prev.focusedCallSid) {
        // Focus the next available call, or null if none
        const remainingCalls = Array.from(newCalls.values());
        if (remainingCalls.length > 0) {
          // Prefer non-held calls
          const nonHeldCall = remainingCalls.find(c => !c.isHeld);
          const nextCall = nonHeldCall || remainingCalls[0];
          focusedCallSid = nextCall.callSid;
          activeCall = nextCall.call;
          callStatus = nextCall.status;
        } else {
          focusedCallSid = null;
          activeCall = null;
          callStatus = null;
        }
      }

      return { ...prev, calls: newCalls, focusedCallSid, activeCall, callStatus };
    });
  }, []);

  // Add a call to state
  const addCall = useCallback((call: Call, callSid: string, direction: "INCOMING" | "OUTGOING") => {
    setState((prev) => {
      // Check if we've reached max concurrent calls
      if (prev.calls.size >= maxConcurrentCalls) {
        console.warn(`Max concurrent calls (${maxConcurrentCalls}) reached, rejecting new call`);
        return prev;
      }

      const newCalls = new Map(prev.calls);
      const callInfo: CallInfo = {
        call,
        callSid,
        status: "pending",
        direction,
        from: call.parameters?.From || "Unknown",
        to: call.parameters?.To || "Unknown",
        isHeld: false,
        isMuted: false,
        startedAt: Date.now(),
      };
      newCalls.set(callSid, callInfo);

      // If this is the first call or no call is focused, focus this one
      const shouldFocus = !prev.focusedCallSid || prev.calls.size === 0;

      return {
        ...prev,
        calls: newCalls,
        focusedCallSid: shouldFocus ? callSid : prev.focusedCallSid,
        activeCall: shouldFocus ? call : prev.activeCall,
        callStatus: shouldFocus ? "pending" : prev.callStatus,
      };
    });

    return true;
  }, [maxConcurrentCalls]);

  // Initialize device
  const initializeDevice = useCallback(async () => {
    const token = await fetchTokenWithRetry(3);
    if (!token) {
      setState((prev) => ({
        ...prev,
        error: "Failed to get Twilio token after multiple attempts",
      }));
      return;
    }

    try {
      // Destroy existing device if any
      if (deviceRef.current) {
        deviceRef.current.destroy();
      }

      const newDevice = new Device(token, {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        closeProtection: true,
        edge: "ashburn",
        // MULTI-CALL: Allow incoming calls even when busy
        allowIncomingWhileBusy: true,
      });

      // Register event handlers
      newDevice.on("registered", () => {
        console.log("Twilio Device registered (multi-call enabled)");
        setState((prev) => ({
          ...prev,
          isReady: true,
          error: null,
        }));
      });

      newDevice.on("unregistered", () => {
        console.log("Twilio Device unregistered");
        setState((prev) => ({
          ...prev,
          isReady: false,
        }));
      });

      newDevice.on("incoming", (call: Call) => {
        const callSid = call.parameters.CallSid;
        console.log(`Incoming call from: ${call.parameters.From} (SID: ${callSid})`);

        // Check if we can accept more calls
        const currentCallCount = state.calls.size;
        if (currentCallCount >= maxConcurrentCalls) {
          console.warn(`Rejecting incoming call - max concurrent calls (${maxConcurrentCalls}) reached`);
          call.reject();
          return;
        }

        // Add the call to our multi-call state
        const added = addCall(call, callSid, "INCOMING");
        if (!added) {
          call.reject();
          return;
        }

        // Set up per-call event handlers
        call.on("accept", () => {
          console.log(`Call accepted: ${callSid}`);
          updateCallInfo(callSid, {
            status: "open",
            answeredAt: Date.now(),
          });
        });

        call.on("disconnect", () => {
          console.log(`Call disconnected: ${callSid}`);
          removeCall(callSid);

          // Clean up the call in Convex database
          if (callSid) {
            fetch("/api/twilio/end-call", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ twilioCallSid: callSid }),
            })
              .then((response) => response.json())
              .then((result) => {
                console.log("Call cleanup result:", result);
              })
              .catch((error) => {
                console.error("Error cleaning up call:", error);
              });
          }
        });

        call.on("cancel", () => {
          console.log(`Call cancelled: ${callSid}`);
          removeCall(callSid);
        });

        call.on("reject", () => {
          console.log(`Call rejected: ${callSid}`);
          removeCall(callSid);
        });
      });

      newDevice.on("error", (error) => {
        console.error("Twilio Device error:", error);
        setState((prev) => ({
          ...prev,
          error: error.message,
        }));
      });

      newDevice.on("tokenWillExpire", async () => {
        console.log("Token will expire, refreshing with retry...");
        const newToken = await fetchTokenWithRetry(3);
        if (newToken) {
          newDevice.updateToken(newToken);
          console.log("Token refreshed successfully");
        } else {
          console.error("Failed to refresh token - device may disconnect");
          setState((prev) => ({
            ...prev,
            error: "Failed to refresh authentication token",
          }));
        }
      });

      // Register the device
      await newDevice.register();
      deviceRef.current = newDevice;
      setState((prev) => ({
        ...prev,
        device: newDevice,
      }));
    } catch (error) {
      console.error("Failed to initialize Twilio device:", error);
      setState((prev) => ({
        ...prev,
        error: "Failed to initialize Twilio device",
      }));
    }
  }, [fetchTokenWithRetry, addCall, updateCallInfo, removeCall, maxConcurrentCalls, state.calls.size]);

  // Make outbound call
  const makeCall = useCallback(
    async (to: string) => {
      if (!deviceRef.current || !state.isReady) {
        console.error("Device not ready");
        return null;
      }

      // Check if we can make more calls
      if (state.calls.size >= maxConcurrentCalls) {
        console.error(`Cannot make call - max concurrent calls (${maxConcurrentCalls}) reached`);
        return null;
      }

      setState((prev) => ({ ...prev, isConnecting: true }));

      try {
        const call = await deviceRef.current.connect({
          params: {
            To: to,
            OrganizationId: organization?.id || "",
          },
        });

        const callSid = call.parameters?.CallSid || `out-${Date.now()}`;
        addCall(call, callSid, "OUTGOING");

        setState((prev) => ({
          ...prev,
          isConnecting: false,
        }));

        call.on("disconnect", () => {
          removeCall(callSid);
        });

        return call;
      } catch (error) {
        console.error("Failed to make call:", error);
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          error: "Failed to make call",
        }));
        return null;
      }
    },
    [state.isReady, state.calls.size, organization, maxConcurrentCalls, addCall, removeCall]
  );

  // Answer a specific incoming call (by callSid)
  const answerCallBySid = useCallback(async (callSid: string, holdOthers: boolean = true) => {
    const callInfo = state.calls.get(callSid);
    if (!callInfo || callInfo.status !== "pending") {
      console.error(`Cannot answer call ${callSid} - not found or not pending`);
      return false;
    }

    // If holdOthers is true, put current focused call on hold first
    if (holdOthers && state.focusedCallSid && state.focusedCallSid !== callSid) {
      const currentCall = state.calls.get(state.focusedCallSid);
      if (currentCall && currentCall.status === "open" && !currentCall.isHeld) {
        await holdCall(state.focusedCallSid);
      }
    }

    // Accept the Twilio call
    callInfo.call.accept();

    // Update state to focus on this call
    setState((prev) => {
      const newCalls = new Map(prev.calls);
      const updated = newCalls.get(callSid);
      if (updated) {
        updated.status = "open";
        updated.answeredAt = Date.now();
        newCalls.set(callSid, updated);
      }
      return {
        ...prev,
        calls: newCalls,
        focusedCallSid: callSid,
        activeCall: updated?.call || null,
        callStatus: "open",
      };
    });

    // Claim the call in the database
    try {
      const response = await fetch("/api/twilio/claim-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twilioCallSid: callSid }),
      });
      const result = await response.json();
      if (result.success) {
        console.log("Call claimed, inbound metrics incremented");
      } else {
        console.log("Call claim result:", result.reason);
      }
    } catch (error) {
      console.error("Failed to claim call:", error);
    }

    return true;
  }, [state.calls, state.focusedCallSid]);

  // Legacy: Answer the first pending incoming call (backward compatibility)
  const answerCall = useCallback(async () => {
    // Find the first pending incoming call
    const pendingCall = Array.from(state.calls.values()).find(
      c => c.direction === "INCOMING" && c.status === "pending"
    );

    if (pendingCall) {
      return answerCallBySid(pendingCall.callSid, true);
    }

    // Legacy fallback for single activeCall
    if (state.activeCall && state.callStatus === "pending") {
      state.activeCall.accept();

      const callSid = state.activeCall.parameters?.CallSid;
      if (callSid) {
        try {
          const response = await fetch("/api/twilio/claim-call", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ twilioCallSid: callSid }),
          });
          const result = await response.json();
          if (result.success) {
            console.log("Call claimed, inbound metrics incremented");
          }
        } catch (error) {
          console.error("Failed to claim call:", error);
        }
      }
    }
  }, [state.calls, state.activeCall, state.callStatus, answerCallBySid]);

  // Reject a specific call
  const rejectCallBySid = useCallback((callSid: string) => {
    const callInfo = state.calls.get(callSid);
    if (!callInfo) {
      console.warn(`rejectCallBySid: call ${callSid} not found`);
      return;
    }

    try {
      if (callInfo.status === "pending") {
        callInfo.call.reject();
      } else {
        callInfo.call.disconnect();
      }
    } catch (error) {
      console.error("Error rejecting call:", error);
      try {
        callInfo.call.disconnect();
      } catch (e) {
        console.error("Disconnect also failed:", e);
      }
    }

    removeCall(callSid);
  }, [state.calls, removeCall]);

  // Legacy: Reject the currently pending incoming call
  const rejectCall = useCallback(() => {
    // Find the first pending incoming call
    const pendingCall = Array.from(state.calls.values()).find(
      c => c.direction === "INCOMING" && c.status === "pending"
    );

    if (pendingCall) {
      rejectCallBySid(pendingCall.callSid);
      return;
    }

    // Legacy fallback
    if (state.activeCall) {
      const callStatus = state.activeCall.status?.();
      try {
        if (callStatus === "pending") {
          state.activeCall.reject();
        } else {
          state.activeCall.disconnect();
        }
      } catch (error) {
        console.error("Error rejecting call, trying disconnect:", error);
        try {
          state.activeCall.disconnect();
        } catch (e) {
          console.error("Disconnect also failed:", e);
        }
      }

      setState((prev) => ({ ...prev, activeCall: null, callStatus: null }));
    }
  }, [state.calls, state.activeCall, rejectCallBySid]);

  // Hang up a specific call
  const hangUpBySid = useCallback((callSid: string) => {
    const callInfo = state.calls.get(callSid);
    if (callInfo) {
      callInfo.call.disconnect();
      removeCall(callSid);
    }
  }, [state.calls, removeCall]);

  // Legacy: Hang up the focused call
  const hangUp = useCallback(() => {
    if (state.focusedCallSid) {
      hangUpBySid(state.focusedCallSid);
    } else if (state.activeCall) {
      state.activeCall.disconnect();
      setState((prev) => ({ ...prev, activeCall: null, callStatus: null }));
    }
  }, [state.focusedCallSid, state.activeCall, hangUpBySid]);

  // Put a call on hold (conference-based hold)
  const holdCall = useCallback(async (callSid: string): Promise<boolean> => {
    const callInfo = state.calls.get(callSid);
    if (!callInfo || callInfo.isHeld) {
      return false;
    }

    try {
      // Call the hold API endpoint
      const response = await fetch("/api/twilio/hold-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twilioCallSid: callSid,
          action: "hold",
        }),
      });

      if (!response.ok) {
        console.error("Failed to hold call:", await response.text());
        return false;
      }

      // Update local state
      updateCallInfo(callSid, { isHeld: true });
      console.log(`Call ${callSid} placed on hold`);
      return true;
    } catch (error) {
      console.error("Error holding call:", error);
      return false;
    }
  }, [state.calls, updateCallInfo]);

  // Resume a call from hold
  const unholdCall = useCallback(async (callSid: string): Promise<boolean> => {
    const callInfo = state.calls.get(callSid);
    if (!callInfo || !callInfo.isHeld) {
      return false;
    }

    try {
      // Call the unhold API endpoint
      const response = await fetch("/api/twilio/unhold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twilioCallSid: callSid,
        }),
      });

      if (!response.ok) {
        console.error("Failed to unhold call:", await response.text());
        return false;
      }

      // Update local state
      updateCallInfo(callSid, { isHeld: false });
      console.log(`Call ${callSid} resumed from hold`);
      return true;
    } catch (error) {
      console.error("Error unholding call:", error);
      return false;
    }
  }, [state.calls, updateCallInfo]);

  // Switch focus to a different call
  const focusCall = useCallback(async (callSid: string) => {
    const targetCall = state.calls.get(callSid);
    if (!targetCall) {
      console.error(`Cannot focus call ${callSid} - not found`);
      return false;
    }

    // If there's a currently focused call that's not held, put it on hold
    if (state.focusedCallSid && state.focusedCallSid !== callSid) {
      const currentCall = state.calls.get(state.focusedCallSid);
      if (currentCall && currentCall.status === "open" && !currentCall.isHeld) {
        await holdCall(state.focusedCallSid);
      }
    }

    // If the target call is on hold, unhold it
    if (targetCall.isHeld) {
      await unholdCall(callSid);
    }

    // Update focus
    setState((prev) => ({
      ...prev,
      focusedCallSid: callSid,
      activeCall: targetCall.call,
      callStatus: targetCall.status,
    }));

    return true;
  }, [state.calls, state.focusedCallSid, holdCall, unholdCall]);

  // Toggle mute on a specific call
  const toggleMuteBySid = useCallback((callSid: string) => {
    const callInfo = state.calls.get(callSid);
    if (callInfo) {
      const isMuted = callInfo.call.isMuted();
      callInfo.call.mute(!isMuted);
      updateCallInfo(callSid, { isMuted: !isMuted });
      return !isMuted;
    }
    return false;
  }, [state.calls, updateCallInfo]);

  // Legacy: Toggle mute on the focused call
  const toggleMute = useCallback(() => {
    if (state.focusedCallSid) {
      return toggleMuteBySid(state.focusedCallSid);
    } else if (state.activeCall) {
      const isMuted = state.activeCall.isMuted();
      state.activeCall.mute(!isMuted);
      return !isMuted;
    }
    return false;
  }, [state.focusedCallSid, state.activeCall, toggleMuteBySid]);

  // Get all calls as array (for UI rendering)
  const getAllCalls = useCallback(() => {
    return Array.from(state.calls.values());
  }, [state.calls]);

  // Get pending (ringing) calls
  const getPendingCalls = useCallback(() => {
    return Array.from(state.calls.values()).filter(c => c.status === "pending");
  }, [state.calls]);

  // Get active (connected) calls
  const getActiveCalls = useCallback(() => {
    return Array.from(state.calls.values()).filter(c => c.status === "open");
  }, [state.calls]);

  // Initialize on mount
  useEffect(() => {
    if (user && organization) {
      initializeDevice();
    }

    return () => {
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
    };
  }, [user, organization, initializeDevice]);

  return {
    // State
    ...state,
    // Multi-call getters
    getAllCalls,
    getPendingCalls,
    getActiveCalls,
    callCount: state.calls.size,
    // Core operations
    initializeDevice,
    makeCall,
    // Answer operations
    answerCall,
    answerCallBySid,
    // Reject operations
    rejectCall,
    rejectCallBySid,
    // Hang up operations
    hangUp,
    hangUpBySid,
    // Hold operations
    holdCall,
    unholdCall,
    focusCall,
    // Mute operations
    toggleMute,
    toggleMuteBySid,
    // Max calls setting
    maxConcurrentCalls,
  };
}
