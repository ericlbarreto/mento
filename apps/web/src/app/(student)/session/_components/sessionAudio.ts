// Owner: Person 2. Tutor voice for `speak.audio_url`: resolves the API's relative URL (apiUrl) and plays it with
// Person 3's PcmPlayer. When muted, or before the page had any user gesture (autoplay would hang the
// AudioContext), play() rejects at once and the queue falls back to the text clock (captions only).
import type { SpeechPlayer, WordTiming } from "@mento/contracts";
import { PcmPlayer } from "@mento/voice/client";

export interface SessionAudio extends SpeechPlayer {
  setMuted(muted: boolean): void;
}

export function createSessionAudio(resolveUrl: (path: string) => string): SessionAudio {
  let pcm: PcmPlayer | null = null;
  let muted = false;
  const player = () => (pcm ??= new PcmPlayer());
  return {
    async play(audio_url: string, signal?: AbortSignal) {
      if (muted) throw new Error("muted");
      const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
      if (activation && !activation.hasBeenActive) throw new Error("no user gesture yet");
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
