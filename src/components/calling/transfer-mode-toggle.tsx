"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "crm-voip:transfer-mode";

export type TransferMode = "cold" | "warm";

/**
 * Persist the user's preferred transfer mode in localStorage so it
 * survives page reloads and route changes. Default = cold (the source
 * agent drops as soon as the caller is moved to the conference).
 *
 * Hook returns `[mode, setMode]`. Components inside the dashboard read
 * `mode` when initiating a drag-transfer.
 */
export function useTransferMode(): [TransferMode, (m: TransferMode) => void] {
  const [mode, setModeState] = useState<TransferMode>("cold");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "warm" || saved === "cold") {
        setModeState(saved);
      }
    } catch {
      // ignore — localStorage may be unavailable in some contexts
    }
  }, []);

  const setMode = (m: TransferMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // ignore
    }
  };

  return [mode, setMode];
}

/**
 * Compact toggle row to drop above the agent grid.
 *
 * Cold (default): on drop, source agent drops immediately, caller and
 * target are connected when target answers.
 *
 * Warm: source agent stays in the conference with the caller while
 * target is ringing/answering. Source drops by hanging up.
 */
export function TransferModeToggle() {
  const [mode, setMode] = useTransferMode();

  return (
    <div className="flex items-center gap-2 text-xs">
      <Label
        htmlFor="transfer-mode-toggle"
        className="text-on-surface-variant cursor-pointer"
      >
        Transfer mode:
      </Label>
      <span
        className={mode === "cold" ? "font-semibold" : "text-on-surface-variant"}
      >
        Cold
      </span>
      <Switch
        id="transfer-mode-toggle"
        checked={mode === "warm"}
        onCheckedChange={(checked) => setMode(checked ? "warm" : "cold")}
        className="data-[state=checked]:bg-primary"
        aria-label="Toggle transfer mode"
      />
      <span
        className={mode === "warm" ? "font-semibold" : "text-on-surface-variant"}
      >
        Warm
      </span>
    </div>
  );
}
