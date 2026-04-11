/**
 * Programmatic ringtone for incoming calls.
 *
 * Twilio Voice SDK has a built-in incoming sound, but modern browsers
 * (Chrome, Safari) block AudioContext until the user has interacted with
 * the page. Result: the first incoming call is silent — the agent sees
 * the visual card but hears nothing. Console shows
 *   "The AudioContext was not allowed to start. It must be resumed
 *    (or created) after a user gesture on the page."
 *
 * This module owns a single shared AudioContext that's resumed on the
 * first user gesture anywhere in the page. From then on, playRingtone()
 * plays a classic "ring-ring" pattern via oscillators — no external
 * audio files, no CDN dependency, works offline.
 */

type RingtoneHandle = {
  stop: () => void;
};

let sharedContext: AudioContext | null = null;
let unlockListenerAttached = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedContext) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    sharedContext = new Ctor();
  }
  return sharedContext;
}

/**
 * Attach a one-time listener that resumes the shared AudioContext on the
 * first user gesture. Call this from a top-level component (e.g. the
 * CallingProvider) once on mount.
 */
export function ensureAudioContextUnlockOnFirstGesture() {
  if (typeof window === "undefined" || unlockListenerAttached) return;
  unlockListenerAttached = true;

  const unlock = () => {
    const ctx = getContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    document.removeEventListener("mousedown", unlock, true);
    document.removeEventListener("keydown", unlock, true);
    document.removeEventListener("touchstart", unlock, true);
  };

  document.addEventListener("mousedown", unlock, true);
  document.addEventListener("keydown", unlock, true);
  document.addEventListener("touchstart", unlock, true);
}

/**
 * Play a classic two-tone ring pattern until stop() is called on the
 * returned handle. Safe to call even if the AudioContext is still
 * suspended — it'll play silently and the next ring will work once the
 * user has interacted with the page.
 */
export function playRingtone(): RingtoneHandle {
  const ctx = getContext();
  if (!ctx) return { stop: () => {} };

  // If the context is suspended, try to resume it. This will succeed
  // silently if the user has already interacted with the page.
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  let stopped = false;
  let cleanupTimers: number[] = [];
  const scheduledNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  // Ring pattern: two quick beeps, pause, repeat. Mimics a US ringback.
  const RING_CYCLE_MS = 4000; // full cycle (2s beeps + 2s silence)

  function scheduleOneCycle(startAt: number) {
    if (stopped) return;

    const gain = ctx!.createGain();
    gain.gain.setValueAtTime(0, startAt);
    gain.connect(ctx!.destination);

    // Two 0.9-second beeps at 480Hz + 440Hz (classic US ring)
    for (const beepOffset of [0, 1.0]) {
      const t = startAt + beepOffset;
      const osc1 = ctx!.createOscillator();
      osc1.frequency.value = 440;
      osc1.connect(gain);
      const osc2 = ctx!.createOscillator();
      osc2.frequency.value = 480;
      osc2.connect(gain);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
      gain.gain.setValueAtTime(0.25, t + 0.88);
      gain.gain.linearRampToValueAtTime(0, t + 0.9);

      osc1.start(t);
      osc1.stop(t + 0.9);
      osc2.start(t);
      osc2.stop(t + 0.9);

      scheduledNodes.push({ osc: osc1, gain });
      scheduledNodes.push({ osc: osc2, gain });
    }
  }

  // Schedule the first cycle immediately and set up the loop.
  const startNow = ctx.currentTime + 0.05;
  scheduleOneCycle(startNow);

  const intervalId = window.setInterval(() => {
    if (stopped) return;
    scheduleOneCycle(ctx.currentTime + 0.05);
  }, RING_CYCLE_MS);
  cleanupTimers.push(intervalId);

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      cleanupTimers.forEach((id) => window.clearInterval(id));
      cleanupTimers = [];
      for (const { osc } of scheduledNodes) {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // Already stopped
        }
      }
      scheduledNodes.length = 0;
    },
  };
}
