import { create } from "zustand";
import { devtools } from "zustand/middleware";

/**
 * Multi-call state management for concurrent call handling
 *
 * This store tracks the UI state of multiple concurrent calls,
 * complementing the Twilio Device hook's call management.
 *
 * Pattern:
 * 1. Twilio Device hook manages actual Call objects
 * 2. This store manages UI state (focus, visual indicators)
 * 3. Both sync via callSid as the primary identifier
 */

export type MultiCallStatus = "ringing" | "connecting" | "active" | "held" | "ended";

export interface MultiCallInfo {
  callSid: string;
  status: MultiCallStatus;
  direction: "inbound" | "outbound";
  callerNumber: string;
  callerName?: string;
  isHeld: boolean;
  isMuted: boolean;
  isFocused: boolean;
  startedAt: number;
  answeredAt?: number;
  holdStartedAt?: number;
  // Conference info for hold (if using conference-based hold)
  holdConferenceName?: string;
}

interface MultiCallState {
  // All active calls (keyed by callSid)
  calls: Record<string, MultiCallInfo>;

  // The currently focused call (has audio)
  focusedCallSid: string | null;

  // Max concurrent calls allowed
  maxConcurrentCalls: number;

  // Actions
  addCall: (call: Omit<MultiCallInfo, "isFocused">) => void;
  removeCall: (callSid: string) => void;
  updateCall: (callSid: string, updates: Partial<MultiCallInfo>) => void;
  setFocusedCall: (callSid: string | null) => void;
  setCallHeld: (callSid: string, isHeld: boolean, holdConferenceName?: string) => void;
  setCallMuted: (callSid: string, isMuted: boolean) => void;
  setCallStatus: (callSid: string, status: MultiCallStatus) => void;
  setMaxConcurrentCalls: (max: number) => void;
  clearAllCalls: () => void;

  // Getters
  getCall: (callSid: string) => MultiCallInfo | undefined;
  getAllCalls: () => MultiCallInfo[];
  getActiveCalls: () => MultiCallInfo[];
  getRingingCalls: () => MultiCallInfo[];
  getHeldCalls: () => MultiCallInfo[];
  canAcceptMoreCalls: () => boolean;
}

export const useMultiCallStore = create<MultiCallState>()(
  devtools(
    (set, get) => ({
      calls: {},
      focusedCallSid: null,
      maxConcurrentCalls: 3,

      addCall: (call) =>
        set((state) => {
          // Check if we can add more calls
          const currentCallCount = Object.keys(state.calls).length;
          if (currentCallCount >= state.maxConcurrentCalls) {
            console.warn(`Cannot add call - max concurrent calls (${state.maxConcurrentCalls}) reached`);
            return state;
          }

          // Determine if this should be the focused call
          const shouldFocus = !state.focusedCallSid || currentCallCount === 0;

          const newCall: MultiCallInfo = {
            ...call,
            isFocused: shouldFocus,
          };

          return {
            calls: { ...state.calls, [call.callSid]: newCall },
            focusedCallSid: shouldFocus ? call.callSid : state.focusedCallSid,
          };
        }, false, "addCall"),

      removeCall: (callSid) =>
        set((state) => {
          const { [callSid]: removed, ...rest } = state.calls;

          // Update focus if needed
          let newFocusedCallSid = state.focusedCallSid;
          if (callSid === state.focusedCallSid) {
            // Focus the next available non-held call
            const remainingCalls = Object.values(rest);
            const nonHeldCall = remainingCalls.find((c) => !c.isHeld && c.status !== "ended");
            const anyCall = remainingCalls.find((c) => c.status !== "ended");
            newFocusedCallSid = nonHeldCall?.callSid || anyCall?.callSid || null;

            // Update the isFocused flag
            if (newFocusedCallSid && rest[newFocusedCallSid]) {
              rest[newFocusedCallSid] = { ...rest[newFocusedCallSid], isFocused: true };
            }
          }

          return {
            calls: rest,
            focusedCallSid: newFocusedCallSid,
          };
        }, false, "removeCall"),

      updateCall: (callSid, updates) =>
        set((state) => {
          const existingCall = state.calls[callSid];
          if (!existingCall) return state;

          return {
            calls: {
              ...state.calls,
              [callSid]: { ...existingCall, ...updates },
            },
          };
        }, false, "updateCall"),

      setFocusedCall: (callSid) =>
        set((state) => {
          // Update isFocused flags for all calls
          const updatedCalls = { ...state.calls };
          for (const sid of Object.keys(updatedCalls)) {
            updatedCalls[sid] = {
              ...updatedCalls[sid],
              isFocused: sid === callSid,
            };
          }

          return {
            calls: updatedCalls,
            focusedCallSid: callSid,
          };
        }, false, "setFocusedCall"),

      setCallHeld: (callSid, isHeld, holdConferenceName) =>
        set((state) => {
          const existingCall = state.calls[callSid];
          if (!existingCall) return state;

          const updates: Partial<MultiCallInfo> = {
            isHeld,
            holdStartedAt: isHeld ? Date.now() : undefined,
            holdConferenceName: isHeld ? holdConferenceName : undefined,
            status: isHeld ? "held" : "active",
          };

          return {
            calls: {
              ...state.calls,
              [callSid]: { ...existingCall, ...updates },
            },
          };
        }, false, "setCallHeld"),

      setCallMuted: (callSid, isMuted) =>
        set((state) => {
          const existingCall = state.calls[callSid];
          if (!existingCall) return state;

          return {
            calls: {
              ...state.calls,
              [callSid]: { ...existingCall, isMuted },
            },
          };
        }, false, "setCallMuted"),

      setCallStatus: (callSid, status) =>
        set((state) => {
          const existingCall = state.calls[callSid];
          if (!existingCall) return state;

          const updates: Partial<MultiCallInfo> = { status };
          if (status === "active" && !existingCall.answeredAt) {
            updates.answeredAt = Date.now();
          }

          return {
            calls: {
              ...state.calls,
              [callSid]: { ...existingCall, ...updates },
            },
          };
        }, false, "setCallStatus"),

      setMaxConcurrentCalls: (max) =>
        set({ maxConcurrentCalls: max }, false, "setMaxConcurrentCalls"),

      clearAllCalls: () =>
        set({ calls: {}, focusedCallSid: null }, false, "clearAllCalls"),

      getCall: (callSid) => get().calls[callSid],

      getAllCalls: () => Object.values(get().calls),

      getActiveCalls: () =>
        Object.values(get().calls).filter(
          (c) => c.status === "active" || c.status === "held"
        ),

      getRingingCalls: () =>
        Object.values(get().calls).filter((c) => c.status === "ringing"),

      getHeldCalls: () =>
        Object.values(get().calls).filter((c) => c.isHeld),

      canAcceptMoreCalls: () => {
        const { calls, maxConcurrentCalls } = get();
        return Object.keys(calls).length < maxConcurrentCalls;
      },
    }),
    { name: "MultiCallStore" }
  )
);

/**
 * Helper to generate a unique call ID for temporary/optimistic entries
 */
export function generateTempCallId(): string {
  return `temp-call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
