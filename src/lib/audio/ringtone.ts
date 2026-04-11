/**
 * Programmatic ringtone for incoming calls.
 *
 * Implementation notes (learned the hard way):
 *
 * Attempt 1 was a Web Audio API oscillator ringtone (see git history).
 * That failed in practice because modern browsers (Chrome, Safari,
 * Firefox) suspend AudioContext until the first user gesture, and
 * scheduling oscillators against a suspended context queues them
 * indefinitely. When the user clicked Answer, the context resumed and
 * every queued oscillator fired at once in a single short burst — the
 * user heard "one fast ring" on answer instead of a proper ringtone
 * while the card was showing.
 *
 * Attempt 2 (this file) uses HTMLAudioElement backed by a WAV Blob URL
 * generated once at module load. HTML audio has slightly more permissive
 * autoplay rules than Web Audio:
 *   - Muted audio plays freely.
 *   - Unmuted audio plays freely once the document has any user
 *     activation (click, tap, keypress anywhere on the page).
 *
 * We still attach a one-time first-gesture unlock listener for
 * belt-and-suspenders reliability, and we explicitly abort audio.play()
 * with a warning if the browser rejects it (which happens on the very
 * first incoming call if the user hasn't interacted with the tab yet).
 */

type RingtoneHandle = {
  stop: () => void;
};

let ringtoneBlobUrl: string | null = null;
let unlockListenerAttached = false;
let audioUnlocked = false;
const unlockSubscribers = new Set<() => void>();

/** Current unlock state. Read-only — updated internally by the primer. */
export function isAudioUnlocked(): boolean {
  return audioUnlocked;
}

/** Subscribe to unlock state changes. Returns an unsubscribe function. */
export function subscribeAudioUnlock(callback: () => void): () => void {
  unlockSubscribers.add(callback);
  return () => {
    unlockSubscribers.delete(callback);
  };
}

function markUnlocked() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  unlockSubscribers.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.warn("[ringtone] unlock subscriber threw:", err);
    }
  });
}

/**
 * Explicitly try to unlock audio by playing a muted primer. Safe to call
 * from a click handler — the click serves as the user gesture that
 * Chrome/Safari require.
 */
export function unlockAudioNow(): Promise<boolean> {
  const url = getRingtoneUrl();
  if (!url) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const primer = new Audio(url);
      primer.muted = true;
      primer.volume = 0;
      primer
        .play()
        .then(() => {
          primer.pause();
          primer.currentTime = 0;
          markUnlocked();
          resolve(true);
        })
        .catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

/**
 * Generate a 2-second WAV containing a 0.5-second US-style ringback beep
 * (sum of 440 Hz + 480 Hz sine waves with a short envelope) followed by
 * 1.5 seconds of silence. HTMLAudioElement loops this natively, giving
 * a natural "ring ... ring ... ring" pattern.
 */
function buildRingWavBlobUrl(): string {
  const sampleRate = 8000;
  const totalSec = 2.0;
  const beepSec = 0.5;
  const freqA = 440;
  const freqB = 480;
  const totalSamples = Math.floor(sampleRate * totalSec);
  const beepSamples = Math.floor(sampleRate * beepSec);

  // 16-bit PCM mono WAV
  const dataSize = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // subchunk1 size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (samples × block align)
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  // PCM data
  for (let i = 0; i < totalSamples; i++) {
    let sample = 0;
    if (i < beepSamples) {
      const t = i / sampleRate;
      // 20ms attack + 20ms release envelope to avoid clicks
      const envelope =
        Math.min(1, t * 50) * Math.min(1, (beepSec - t) * 50);
      sample =
        (Math.sin(2 * Math.PI * freqA * t) +
          Math.sin(2 * Math.PI * freqB * t)) *
        0.2 *
        envelope;
    }
    const intSample = Math.round(
      Math.max(-1, Math.min(1, sample)) * 0x7fff
    );
    view.setInt16(44 + i * 2, intSample, true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function getRingtoneUrl(): string | null {
  if (typeof window === "undefined") return null;
  if (!ringtoneBlobUrl) {
    try {
      ringtoneBlobUrl = buildRingWavBlobUrl();
    } catch (err) {
      console.warn("[ringtone] Failed to build WAV blob:", err);
      return null;
    }
  }
  return ringtoneBlobUrl;
}

/**
 * Attach a one-time listener that resumes any playing audio on the
 * first user gesture. Also primes the audio element so its internal
 * decoder is ready. Call this once from a top-level component.
 */
export function ensureAudioContextUnlockOnFirstGesture() {
  if (typeof window === "undefined" || unlockListenerAttached) return;
  unlockListenerAttached = true;

  const unlock = () => {
    // Pre-load the ringtone Blob so the decoder is warm when a call
    // actually arrives. Playing and immediately pausing a muted audio
    // element gives the browser a chance to unlock its audio output
    // layer without making any audible noise.
    const url = getRingtoneUrl();
    if (url) {
      try {
        const primer = new Audio(url);
        primer.muted = true;
        primer.volume = 0;
        void primer
          .play()
          .then(() => {
            primer.pause();
            primer.currentTime = 0;
            markUnlocked();
          })
          .catch(() => {});
      } catch {
        // Ignore — the real ringtone will still try to play on incoming.
      }
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
 * Start playing the ringtone on loop. Returns a handle with stop().
 *
 * Silent if the browser blocks audio playback (autoplay policy). In
 * that case the first call has no ring, but once the user has
 * interacted with the page at all, subsequent calls ring normally.
 * No queued-audio burst on answer either way — if the browser blocks
 * play(), nothing is scheduled so nothing plays on unlock.
 */
export function playRingtone(): RingtoneHandle {
  if (typeof window === "undefined") return { stop: () => {} };

  const url = getRingtoneUrl();
  if (!url) return { stop: () => {} };

  let audio: HTMLAudioElement | null = null;
  try {
    audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.6;
  } catch (err) {
    console.warn("[ringtone] Failed to create Audio element:", err);
    return { stop: () => {} };
  }

  // Attempt to play. The promise rejects on autoplay-blocked browsers.
  audio
    .play()
    .then(() => {
      // Successful playback also counts as audio being unlocked.
      markUnlocked();
    })
    .catch((err) => {
      console.warn(
        "[ringtone] Browser blocked audio playback (autoplay policy). " +
          "User needs to click the page to enable ringing. " +
          (err instanceof Error ? err.message : String(err))
      );
      // Don't null out `audio` — if the user interacts later and we
      // re-call play() via another incoming call, it'll work.
    });

  return {
    stop: () => {
      if (!audio) return;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // Ignore — element may be in a bad state
      }
      audio = null;
    },
  };
}
