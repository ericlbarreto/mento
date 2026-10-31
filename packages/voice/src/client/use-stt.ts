import { useCallback, useEffect, useRef, useState } from "react";
import type { SttCaption, VoiceTokenResponse } from "@mento/contracts";
import { startMic, type Mic } from "./mic";
import { createSttSession, type SttSession } from "./stt-session";

export interface UseSttOptions {
  /** Calls POST /api/voice/token. */
  getToken: () => Promise<VoiceTokenResponse>;
  /** The student's full utterance (final caption). Send it as a `user_message` with kind "speech". */
  onFinal: (caption: SttCaption) => void;
  /** The student started speaking: stop the tutor's audio and abort the turn. */
  onSpeechStarted: () => void;
}

export type SttState = "idle" | "connecting" | "listening" | "muted" | "error";

export function useStt(opts: UseSttOptions) {
  const [state, setState] = useState<SttState>("idle");
  const [caption, setCaption] = useState<SttCaption | null>(null);
  const session = useRef<SttSession | null>(null);
  const mic = useRef<Mic | null>(null);
  const latest = useRef(opts);
  latest.current = opts;

  const stop = useCallback(() => {
    mic.current?.stop();
    session.current?.stop();
    mic.current = null;
    session.current = null;
    setState("idle");
  }, []);

  const start = useCallback(async () => {
    setState("connecting");
    try {
      const s = createSttSession({
        getToken: () => latest.current.getToken(),
        onEvent: (ev) => {
          if (ev.type === "speech_started") return latest.current.onSpeechStarted();
          setCaption(ev.caption);
          if (ev.caption.kind === "final") latest.current.onFinal(ev.caption);
        },
        onError: () => setState("error"),
        onClose: () => setState((prev) => (prev === "error" ? prev : "idle")),
      });
      await s.start();
      session.current = s;
      mic.current = await startMic((pcm) => s.sendAudio(pcm));
      setState("listening");
    } catch {
      stop();
      setState("error");
    }
  }, [stop]);

  const setMuted = useCallback((muted: boolean) => {
    session.current?.setMuted(muted);
    mic.current?.setMuted(muted);
    setState(muted ? "muted" : "listening");
  }, []);

  useEffect(() => stop, [stop]);

  return { state, caption, start, stop, setMuted };
}
