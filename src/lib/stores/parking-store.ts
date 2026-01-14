import { create } from "zustand";
import { devtools } from "zustand/middleware";

/**
 * Optimistic parking state for immediate UI feedback
 *
 * Pattern from working app:
 * 1. Add temp entry immediately on drag end
 * 2. Call Twilio API (conference parking)
 * 3. Call Convex mutation (database)
 * 4. Remove temp entry (real one arrives via subscription)
 */

export interface OptimisticParkedCall {
  id: string; // temp ID like "temp-park-1234567890"
  twilioCallSid: string;
  callerNumber: string;
  callerName?: string;
  parkedAt: number;
  parkedByUserId?: string;
  parkedByName?: string;
  conferenceName?: string;
  slotNumber?: number;
}

interface ParkingState {
  // Optimistic parked calls (temp entries before DB confirms)
  optimisticCalls: Map<string, OptimisticParkedCall>;

  // Track which call is being parked (for loading state)
  parkingInProgress: string | null;

  // Actions
  addOptimisticCall: (call: OptimisticParkedCall) => void;
  removeOptimisticCall: (callId: string) => void;
  setParkingInProgress: (callSid: string | null) => void;
  clearAll: () => void;

  // Getters
  getOptimisticCall: (callId: string) => OptimisticParkedCall | undefined;
  getAllOptimisticCalls: () => OptimisticParkedCall[];
}

export const useParkingStore = create<ParkingState>()(
  devtools(
    (set, get) => ({
      optimisticCalls: new Map(),
      parkingInProgress: null,

      addOptimisticCall: (call) =>
        set((state) => {
          const newMap = new Map(state.optimisticCalls);
          newMap.set(call.id, call);
          return { optimisticCalls: newMap };
        }, false, "addOptimisticCall"),

      removeOptimisticCall: (callId) =>
        set((state) => {
          const newMap = new Map(state.optimisticCalls);
          newMap.delete(callId);
          return { optimisticCalls: newMap };
        }, false, "removeOptimisticCall"),

      setParkingInProgress: (callSid) =>
        set({ parkingInProgress: callSid }, false, "setParkingInProgress"),

      clearAll: () =>
        set({ optimisticCalls: new Map(), parkingInProgress: null }, false, "clearAll"),

      getOptimisticCall: (callId) => get().optimisticCalls.get(callId),

      getAllOptimisticCalls: () => Array.from(get().optimisticCalls.values()),
    }),
    { name: "ParkingStore" }
  )
);

/**
 * Helper to generate temp parking ID
 */
export function generateTempParkingId(): string {
  return `temp-park-${Date.now()}`;
}
