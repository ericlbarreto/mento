// Owner: Person 2. Tutor voice for `speak.audio_url`: resolves the API's relative URL (apiUrl) and plays it with
// Person 3's PcmPlayer as soon as the queue reaches the speak (the fetch starts right away; the audio streams).
// Browsers only start an AudioContext inside a user gesture (or after one, Chrome's sticky activation), so
// `unlock()` is called from the student's click: it creates the context and plays two silent samples. Until
// then, or while muted, play() rejects at once and the queue falls back to the text clock (captions only).
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
  readonly unlocked: boolean;
}

export function createSessionAudio(
  resolveUrl: (path: string) => string,
  { timeoutMs = UNLOCK_TIMEOUT_MS, createPlayer = () => new PcmPlayer() }: { timeoutMs?: number; createPlayer?: () => SpeechPlayer } = {},
): SessionAudio {
  let pcm: SpeechPlayer | null = null;
  let muted = false;
  let unlocked = false;
  const player = () => (pcm ??= createPlayer());
  return {
    get unlocked() {
      return unlocked;
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
      if (muted) throw new Error("muted");
      if (!unlocked) throw new Error("audio locked (no user gesture yet)");
      await player().play(resolveUrl(audio_url), signal);
    },
    stop: () => pcm?.stop(),
    onWord: (cb: (word: WordTiming) => void) => player().onWord(cb),
    level: () => (pcm && !muted ? pcm.level() : 0),
    setMuted(next) {
      muted = next;
      // Silence now: the current line ends early (its caption stays); the next lines use the text clock.
      if (next) pcm?.stop();
    },
  };
}
