"use client";

import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import {
  isAudioUnlocked,
  subscribeAudioUnlock,
  unlockAudioNow,
} from "@/lib/audio/ringtone";

/**
 * Persistent yellow banner that prompts the user to click anywhere to
 * unlock the browser's audio autoplay policy. Without this, modern
 * browsers block ALL ringtone audio until the user has had at least one
 * gesture on the page — which means the very first incoming call after
 * a page load is silent.
 *
 * The banner subscribes to the unlock state in src/lib/audio/ringtone.ts
 * and disappears the instant audio is unlocked (either by clicking the
 * banner itself or by clicking anywhere else on the page).
 */
export function AudioUnlockBanner() {
  const [unlocked, setUnlocked] = useState(true);

  useEffect(() => {
    // Read once on mount, then subscribe.
    setUnlocked(isAudioUnlocked());
    const unsubscribe = subscribeAudioUnlock(() => {
      setUnlocked(isAudioUnlocked());
    });
    return unsubscribe;
  }, []);

  if (unlocked) return null;

  return (
    <button
      type="button"
      onClick={() => {
        void unlockAudioNow();
      }}
      className="w-full bg-yellow-400 hover:bg-yellow-500 text-black px-4 py-2 text-center font-medium border-b border-yellow-500/40 flex items-center justify-center gap-2 cursor-pointer transition-colors"
    >
      <Volume2 className="h-4 w-4" />
      <span>
        Click here to enable call ringing sounds
      </span>
    </button>
  );
}
