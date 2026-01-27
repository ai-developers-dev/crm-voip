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
  isReconnecting: boolean;
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

// Reconnection settings
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const RECONNECT_MAX_ATTEMPTS = 10;
const TOKEN_REFRESH_BEFORE_EXPIRY_MS = 60000; // Refresh 60s before expiry (more buffer)

export function useTwilioDevice(maxConcurrentCalls: number = DEFAULT_MAX_CONCURRENT_CALLS) {
  const { user } = useUser();
  const { organization } = useOrganization();
  const [state, setState] = useState<TwilioDeviceState>({
    device: null,
    isReady: false,
    isConnecting: false,
    isReconnecting: false,
    calls: new Map(),
    focusedCallSid: null,
    activeCall: null,
    callStatus: null,
    error: null,
  });
  const deviceRef = useRef<Device | null>(null);

  // Use ref to track call count to avoid stale closures in event handlers
  const callsRef = useRef<Map<string, CallInfo>>(new Map());
  const maxCallsRef = useRef(maxConcurrentCalls);

  // Refs for reconnection logic
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isReconnectingRef = useRef(false);
  const lastVisibilityChangeRef = useRef<number>(Date.now());
  const userRef = useRef(user);
  const organizationRef = useRef(organization);

  // Keep user/org refs up to date
  useEffect(() => {
    userRef.current = user;
    organizationRef.current = organization;
  }, [user, organization]);

  // Keep refs in sync with state
  useEffect(() => {
    callsRef.current = state.calls;
  }, [state.calls]);

  useEffect(() => {
    maxCallsRef.current = maxConcurrentCalls;
  }, [maxConcurrentCalls]);

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

  // Clear any pending reconnection timeout
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Forward declaration - will be set by initializeDevice
  const initializeDeviceRef = useRef<(() => Promise<void>) | null>(null);

  // Attempt to reconnect with exponential backoff
  const attemptReconnect = useCallback(async () => {
    // Don't reconnect if already reconnecting or no user/org
    if (isReconnectingRef.current || !userRef.current || !organizationRef.current) {
      return;
    }

    // Check if we've exceeded max attempts
    if (reconnectAttemptRef.current >= RECONNECT_MAX_ATTEMPTS) {
      console.error(`Max reconnection attempts (${RECONNECT_MAX_ATTEMPTS}) reached`);
      setState((prev) => ({
        ...prev,
        isReconnecting: false,
        error: "Connection lost. Please refresh the page.",
      }));
      return;
    }

    isReconnectingRef.current = true;
    setState((prev) => ({ ...prev, isReconnecting: true }));

    // Calculate delay with exponential backoff
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttemptRef.current),
      RECONNECT_MAX_DELAY_MS
    );

    reconnectAttemptRef.current += 1;
    console.log(`Attempting reconnection (attempt ${reconnectAttemptRef.current}/${RECONNECT_MAX_ATTEMPTS}) in ${delay}ms...`);

    reconnectTimeoutRef.current = setTimeout(async () => {
      try {
        // First try to just re-register if device exists
        if (deviceRef.current) {
          try {
            console.log("Attempting to re-register existing device...");
            await deviceRef.current.register();
            console.log("Re-registration successful");
            reconnectAttemptRef.current = 0;
            isReconnectingRef.current = false;
            setState((prev) => ({ ...prev, isReconnecting: false, isReady: true, error: null }));
            return;
          } catch (registerError: unknown) {
            console.warn("Re-registration failed, will reinitialize device:", registerError);
            // If re-register fails, destroy and reinitialize
            deviceRef.current.destroy();
            deviceRef.current = null;
          }
        }

        // Use the full initializeDevice function (via ref to avoid circular dependency)
        if (initializeDeviceRef.current) {
          await initializeDeviceRef.current();
          // If initializeDevice succeeds, reset reconnect state
          reconnectAttemptRef.current = 0;
          isReconnectingRef.current = false;
          setState((prev) => ({ ...prev, isReconnecting: false }));
        } else {
          console.error("initializeDevice not available for reconnection");
          isReconnectingRef.current = false;
        }
      } catch (error) {
        console.error("Reconnection attempt failed:", error);
        isReconnectingRef.current = false;
        // Schedule another attempt
        setTimeout(() => attemptReconnect(), RECONNECT_BASE_DELAY_MS);
      }
    }, delay);
  }, []);

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

  // Add a call to state - returns true if added, false if rejected
  const addCallToState = useCallback((call: Call, callSid: string, direction: "INCOMING" | "OUTGOING"): boolean => {
    let wasAdded = false;

    setState((prev) => {
      // Check if we've reached max concurrent calls using ref for current value
      if (prev.calls.size >= maxCallsRef.current) {
        console.warn(`Max concurrent calls (${maxCallsRef.current}) reached, rejecting new call`);
        wasAdded = false;
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

      wasAdded = true;

      return {
        ...prev,
        calls: newCalls,
        focusedCallSid: shouldFocus ? callSid : prev.focusedCallSid,
        activeCall: shouldFocus ? call : prev.activeCall,
        callStatus: shouldFocus ? "pending" : prev.callStatus,
      };
    });

    return wasAdded;
  }, []);

  // Initialize device - only depends on stable refs, not state
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
        console.log("Twilio Device unregistered - attempting reconnection");
        setState((prev) => ({
          ...prev,
          isReady: false,
        }));
        // Attempt to reconnect when device becomes unregistered
        attemptReconnect();
      });

      newDevice.on("incoming", (call: Call) => {
        const callSid = call.parameters.CallSid;
        const from = call.parameters.From;
        console.log(`Incoming call from: ${from} (SID: ${callSid})`);

        // Check if we can accept more calls using REF (not stale state)
        const currentCallCount = callsRef.current.size;
        const maxCalls = maxCallsRef.current;

        console.log(`Current calls: ${currentCallCount}, Max: ${maxCalls}`);

        if (currentCallCount >= maxCalls) {
          console.warn(`Rejecting incoming call - max concurrent calls (${maxCalls}) reached`);
          call.reject();
          return;
        }

        // Add the call to our multi-call state
        const callInfo: CallInfo = {
          call,
          callSid,
          status: "pending",
          direction: "INCOMING",
          from: from || "Unknown",
          to: call.parameters?.To || "Unknown",
          isHeld: false,
          isMuted: false,
          startedAt: Date.now(),
        };

        // Update state with new call
        setState((prev) => {
          // Double-check inside setState to be safe
          if (prev.calls.size >= maxCallsRef.current) {
            console.warn(`Rejecting - max calls reached (checked in setState)`);
            call.reject();
            return prev;
          }

          const newCalls = new Map(prev.calls);
          newCalls.set(callSid, callInfo);

          // If this is the first call or no call is focused, focus this one
          const shouldFocus = !prev.focusedCallSid || prev.calls.size === 0;

          console.log(`Call added to state. Total calls: ${newCalls.size}, shouldFocus: ${shouldFocus}`);

          return {
            ...prev,
            calls: newCalls,
            focusedCallSid: shouldFocus ? callSid : prev.focusedCallSid,
            activeCall: shouldFocus ? call : prev.activeCall,
            callStatus: shouldFocus ? "pending" : prev.callStatus,
          };
        });

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

      newDevice.on("error", (error: { code?: number; message: string }) => {
        console.error("Twilio Device error:", error);

        // Check for token-related errors that require reconnection
        const tokenErrors = [20101, 20104, 31005, 31009]; // AccessTokenInvalid, AccessTokenExpired, ConnectionError, TransportError
        if (error.code && tokenErrors.includes(error.code)) {
          console.log(`Token/connection error (${error.code}) - attempting reconnection`);
          setState((prev) => ({
            ...prev,
            isReady: false,
            error: `Connection error (${error.code}). Reconnecting...`,
          }));
          attemptReconnect();
        } else {
          setState((prev) => ({
            ...prev,
            error: error.message,
          }));
        }
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
  // IMPORTANT: Only depend on stable functions, NOT state.calls.size
  }, [fetchTokenWithRetry, updateCallInfo, removeCall, attemptReconnect]);

  // Keep initializeDevice ref up to date for reconnection
  useEffect(() => {
    initializeDeviceRef.current = initializeDevice;
  }, [initializeDevice]);

  // Make outbound call
  const makeCall = useCallback(
    async (to: string) => {
      if (!deviceRef.current || !state.isReady) {
        console.error("Device not ready");
        return null;
      }

      // Check if we can make more calls using ref
      if (callsRef.current.size >= maxCallsRef.current) {
        console.error(`Cannot make call - max concurrent calls (${maxCallsRef.current}) reached`);
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

        // Add to state
        const callInfo: CallInfo = {
          call,
          callSid,
          status: "connecting",
          direction: "OUTGOING",
          from: "You",
          to,
          isHeld: false,
          isMuted: false,
          startedAt: Date.now(),
        };

        setState((prev) => {
          const newCalls = new Map(prev.calls);
          newCalls.set(callSid, callInfo);
          const shouldFocus = !prev.focusedCallSid || prev.calls.size === 0;

          return {
            ...prev,
            isConnecting: false,
            calls: newCalls,
            focusedCallSid: shouldFocus ? callSid : prev.focusedCallSid,
            activeCall: shouldFocus ? call : prev.activeCall,
            callStatus: shouldFocus ? "connecting" : prev.callStatus,
          };
        });

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
    [state.isReady, organization, removeCall]
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

  // Visibility change handler - reconnect when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        const timeSinceLastChange = now - lastVisibilityChangeRef.current;
        lastVisibilityChangeRef.current = now;

        console.log(`Tab became visible (was hidden for ${Math.round(timeSinceLastChange / 1000)}s)`);

        // If device exists but is not ready, attempt reconnection
        // Only trigger if hidden for more than 30 seconds to avoid unnecessary reconnects
        if (timeSinceLastChange > 30000 && !state.isReady && userRef.current && organizationRef.current) {
          console.log("Device not ready after returning to tab - attempting reconnection");
          attemptReconnect();
        } else if (deviceRef.current && !state.isReady) {
          // Try a quick re-register if device exists but not ready
          console.log("Attempting quick re-register after tab focus...");
          deviceRef.current.register().catch((error) => {
            console.warn("Quick re-register failed:", error);
            attemptReconnect();
          });
        }
      } else {
        lastVisibilityChangeRef.current = Date.now();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [state.isReady, attemptReconnect]);

  // Online/offline handler - reconnect when network comes back
  useEffect(() => {
    const handleOnline = () => {
      console.log("Network came back online");
      // If device is not ready, attempt reconnection
      if (!state.isReady && userRef.current && organizationRef.current) {
        console.log("Device not ready - attempting reconnection after network restored");
        // Reset reconnect attempts since this is a new network event
        reconnectAttemptRef.current = 0;
        attemptReconnect();
      } else if (deviceRef.current && !state.isReady) {
        // Try to re-register existing device
        deviceRef.current.register().catch((error) => {
          console.warn("Re-register failed after coming online:", error);
          attemptReconnect();
        });
      }
    };

    const handleOffline = () => {
      console.log("Network went offline");
      setState((prev) => ({
        ...prev,
        isReady: false,
        error: "Network offline",
      }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [state.isReady, attemptReconnect]);

  // Initialize on mount - only when user/org changes
  useEffect(() => {
    if (user && organization) {
      // Reset reconnect state on fresh initialization
      reconnectAttemptRef.current = 0;
      isReconnectingRef.current = false;
      clearReconnectTimeout();

      initializeDevice();
    }

    return () => {
      clearReconnectTimeout();
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
    };
  }, [user, organization, initializeDevice, clearReconnectTimeout]);

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
