"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Device, Call } from "@twilio/voice-sdk";
import { useUser, useOrganization } from "@clerk/nextjs";

export interface TwilioDeviceState {
  device: Device | null;
  isReady: boolean;
  isConnecting: boolean;
  activeCall: Call | null;
  callStatus: "pending" | "connecting" | "open" | "closed" | null;
  error: string | null;
}

export function useTwilioDevice() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const [state, setState] = useState<TwilioDeviceState>({
    device: null,
    isReady: false,
    isConnecting: false,
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
      });

      // Register event handlers
      newDevice.on("registered", () => {
        console.log("Twilio Device registered");
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
        console.log("Incoming call from:", call.parameters.From);
        setState((prev) => ({
          ...prev,
          activeCall: call,
          callStatus: "pending",
        }));

        // Set up call event handlers
        call.on("accept", () => {
          console.log("Call accepted, audio connected");
          // Update call status to open - this will hide the incoming call popup
          setState((prev) => ({
            ...prev,
            callStatus: "open",
          }));
          // Note: claim-call is handled in answerCall function to avoid duplicate API calls
        });

        call.on("disconnect", () => {
          console.log("Call disconnected");
          setState((prev) => ({
            ...prev,
            activeCall: null,
            callStatus: null,
          }));

          // Clean up the call in Convex database
          const callSid = call.parameters.CallSid;
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
          console.log("Call cancelled");
          setState((prev) => ({
            ...prev,
            activeCall: null,
            callStatus: null,
          }));
        });

        call.on("reject", () => {
          console.log("Call rejected");
          setState((prev) => ({
            ...prev,
            activeCall: null,
            callStatus: null,
          }));
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
  }, [fetchTokenWithRetry]);

  // Make outbound call
  const makeCall = useCallback(
    async (to: string) => {
      if (!deviceRef.current || !state.isReady) {
        console.error("Device not ready");
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

        setState((prev) => ({
          ...prev,
          activeCall: call,
          isConnecting: false,
        }));

        call.on("disconnect", () => {
          setState((prev) => ({
            ...prev,
            activeCall: null,
          }));
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
    [state.isReady, organization]
  );

  // Answer incoming call
  const answerCall = useCallback(async () => {
    if (state.activeCall) {
      // Accept the Twilio call
      state.activeCall.accept();

      // Claim the call in the database to increment metrics
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
            console.log("✅ Call claimed, inbound metrics incremented");
          } else {
            console.log("Call claim result:", result.reason);
          }
        } catch (error) {
          console.error("Failed to claim call:", error);
        }
      }
    }
  }, [state.activeCall]);

  // Reject incoming call
  const rejectCall = useCallback(() => {
    if (state.activeCall) {
      const callStatus = state.activeCall.status?.();
      console.log("Rejecting call, current status:", callStatus);

      try {
        // Only use reject() if call is still pending (ringing)
        if (callStatus === "pending") {
          state.activeCall.reject();
          console.log("Call rejected via reject()");
        } else {
          // If call is in any other state, use disconnect()
          state.activeCall.disconnect();
          console.log("Call disconnected via disconnect()");
        }
      } catch (error) {
        console.error("Error rejecting call, trying disconnect:", error);
        // Fallback to disconnect if reject fails
        try {
          state.activeCall.disconnect();
        } catch (e) {
          console.error("Disconnect also failed:", e);
        }
      }

      setState((prev) => ({ ...prev, activeCall: null, callStatus: null }));
    } else {
      console.warn("rejectCall called but no activeCall in state");
    }
  }, [state.activeCall]);

  // Hang up current call
  const hangUp = useCallback(() => {
    if (state.activeCall) {
      state.activeCall.disconnect();
      setState((prev) => ({ ...prev, activeCall: null, callStatus: null }));
    }
  }, [state.activeCall]);

  // Mute/unmute
  const toggleMute = useCallback(() => {
    if (state.activeCall) {
      const isMuted = state.activeCall.isMuted();
      state.activeCall.mute(!isMuted);
      return !isMuted;
    }
    return false;
  }, [state.activeCall]);

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
    ...state,
    initializeDevice,
    makeCall,
    answerCall,
    rejectCall,
    hangUp,
    toggleMute,
  };
}
