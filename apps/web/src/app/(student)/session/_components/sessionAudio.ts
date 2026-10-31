// Owner: Person 2. Tutor voice for `speak.audio_url`: resolves the API's relative URL (apiUrl) and plays it with
// Person 3's PcmPlayer as soon as the queue reaches the speak (the fetch starts right away; the audio streams).
// Browsers only start an AudioContext inside a user gesture (or after one, Chrome's sticky activation), so
// `unlock()` is called from the student's click: it creates the context and plays two silent samples. Until
// then play() rejects at once and the queue falls back to the text clock (captions only). Muting cuts the output only;
// pausing suspends the AudioContext, so the voice stops mid-word and resumes from the same sample.
import type { SpeechPlayer, WordTiming } from "@mento/contracts";
import { PcmPlayer } from "@mento/voice/client";

/** 4 bytes = 2 silent PCM samples: enough to start (resume) the AudioContext through the public play(). */
const SILENCE = "data:application/octet-stream;base64,AAAAAA==";
/** A resume() that has not settled by then is blocked by the autoplay policy (no gesture yet). */
const UNLOCK_TIMEOUT_MS = 1500;

export interface SessionAudio extends SpeechPlayer {
  setMuted(muted: boolean): void;
  /** Starts the audio output. Call it inside a user gesture; resolves false when the browser still blocks it. */
  unlock(): Promise<boolean>;
  /** Downloads a speak's audio ahead of time (called when the action arrives, while earlier lines still play). */
  prefetch(audio_url: string): void;
  /** Freezes the tutor's voice where it is (AudioContext.suspend); the line's download keeps going. */
  pause(): void;
  /** Continues the voice from the same point. */
  resume(): void;
  readonly paused: boolean;
  readonly unlocked: boolean;
}

export function createSessionAudio(
  resolveUrl: (path: string) => string,
  { timeoutMs = UNLOCK_TIMEOUT_MS, createPlayer = () => new PcmPlayer() }: { timeoutMs?: number; createPlayer?: () => SpeechPlayer } = {},
): SessionAudio {
  let pcm: SpeechPlayer | null = null;
  let muted = false;
  let unlocked = false;
  let paused = false;
  const player = () => (pcm ??= createPlayer());
  // PcmPlayer schedules its buffers on the AudioContext clock, so suspending the context freezes the voice (and
  // what is scheduled after it) on the exact sample. TODO(P3): public pause/resume on PcmPlayer.
  const context = () => (pcm as unknown as { ctx?: AudioContext | null } | null)?.ctx ?? null;
  // PcmPlayer has no volume API: its graph is source → analyser → destination, so muting disconnects the
  // analyser from the speakers (the analyser still feeds the orb level). TODO(P3): a public setVolume on PcmPlayer.
  let outputConnected = true;
  const applyMute = () => {
    const graph = pcm as unknown as { ctx?: AudioContext | null; analyser?: AudioNode | null } | null;
    const ctx = graph?.ctx;
    const analyser = graph?.analyser;
    if (!ctx || !analyser) return;
    if (muted && outputConnected) {
      analyser.disconnect(ctx.destination);
      outputConnected = false;
    } else if (!muted && !outputConnected) {
      analyser.connect(ctx.destination);
      outputConnected = true;
    }
  };
  // Lines queued behind the one playing are downloaded while it plays, so the next line starts with no gap.
  // A finished download plays from a blob URL; one still in flight is skipped and the line streams as usual.
  const ready = new Map<string, string>();
  const inFlight = new Set<string>();
  const MAX_PREFETCH = 12;
  return {
    prefetch(audio_url) {
      if (ready.has(audio_url) || inFlight.has(audio_url) || ready.size + inFlight.size >= MAX_PREFETCH) return;
      inFlight.add(audio_url);
      fetch(resolveUrl(audio_url))
        .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((blob) => ready.set(audio_url, URL.createObjectURL(blob)))
        .catch(() => undefined)
        .finally(() => inFlight.delete(audio_url));
    },
    get unlocked() {
      return unlocked;
    },
    get paused() {
      return paused;
    },
    pause() {
      if (paused) return;
      paused = true;
      const ctx = context();
      if (ctx && ctx.state === "running") void ctx.suspend().catch(() => undefined);
    },
    resume() {
      if (!paused) return;
      paused = false;
      const ctx = context();
      if (ctx && ctx.state === "suspended" && unlocked) void ctx.resume().catch(() => undefined);
    },
    unlock() {
      if (unlocked) return Promise.resolve(true);
      // play() calls AudioContext.resume() synchronously, so a call from a click handler counts as the gesture.
      const attempt = player()
        .play(SILENCE)
        .then(() => (unlocked = true))
        .catch(() => false);
      const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(unlocked), timeoutMs));
      return Promise.race([attempt, timeout]);
    },
    async play(audio_url: string, signal?: AbortSignal) {
      if (!unlocked) throw new Error("audio locked (no user gesture yet)");
      applyMute();
      const local = ready.get(audio_url);
      if (local) {
        ready.delete(audio_url);
        try {
          await player().play(local, signal);
        } finally {
          URL.revokeObjectURL(local);
        }
        return;
      }
      await player().play(resolveUrl(audio_url), signal);
    },
    stop: () => pcm?.stop(),
    onWord: (cb: (word: WordTiming) => void) => player().onWord(cb),
    // A suspended analyser keeps its last frame: report silence while paused.
    level: () => (pcm && !muted && !paused ? pcm.level() : 0),
    setMuted(next) {
      muted = next;
      // A real mute: the line keeps playing (captions and pacing unchanged), only the output is cut, so
      // un-muting brings the voice back mid-sentence.
      applyMute();
    },
  };
}
