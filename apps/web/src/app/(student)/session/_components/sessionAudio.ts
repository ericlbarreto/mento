// Owner: Person 2. Tutor voice for `speak.audio_url`: resolves the API's relative URL (apiUrl) and plays it with
// Person 3's PcmPlayer as soon as the queue reaches the speak (the fetch starts right away; the audio streams).
// Browsers only start an AudioContext inside a user gesture (or after one, Chrome's sticky activation), so
// `unlock()` is called from the student's click: it creates the context and plays two silent samples. Until
// then play() rejects at once and the queue falls back to the text clock (captions only). Muting cuts the output only.
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
      if (!unlocked) throw new Error("audio locked (no user gesture yet)");
      applyMute();
      await player().play(resolveUrl(audio_url), signal);
    },
    stop: () => pcm?.stop(),
    onWord: (cb: (word: WordTiming) => void) => player().onWord(cb),
    level: () => (pcm && !muted ? pcm.level() : 0),
    setMuted(next) {
      muted = next;
      // A real mute: the line keeps playing (captions and pacing unchanged), only the output is cut, so
      // un-muting brings the voice back mid-sentence.
      applyMute();
    },
  };
}
