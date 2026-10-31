"use client";

// Owner: Person 2. The spoken side of a voice session (docs/frontend-integration.md §6 and §9): unlock the tutor's
// audio and ask for the microphone in the student's gesture, run Person 3's useStt (Deepgram) with the
// turn-taking rules of ./turnTaking, send each final caption, and cut the tutor when the student talks over it.
import { useCallback, useEffect, useRef, useState } from "react";
import type { SttCaption, VoiceTokenResponse } from "@mento/contracts";
import { useStt } from "@mento/voice/client";
import type { SessionAudio } from "../sessionAudio";
import { type MicStatus, micMuted, micStatus, shouldBargeIn } from "./turnTaking";

/** "pending": not decided yet; "locked": needs a tap; "blocked": a tap-less unlock failed (also needs a tap). */
export type AudioGate = "pending" | "locked" | "unlocking" | "ready" | "blocked";

type Permission = "unknown" | "asking" | "granted" | "denied";

/** Sticky user activation (a click on the home card survives the client-side navigation to the session). */
function hasUserActivation(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  // Without the API (older browsers) just try: unlock() times out if the browser blocks it.
  return activation ? activation.hasBeenActive : true;
}

const isVoiceUnavailable = (err: unknown) =>
  typeof err === "object" && err !== null && "status" in err && (err as { status: unknown }).status === 503;

export function useSessionVoice({
  enabled,
  audio,
  getToken,
  floor,
  speakingId,
  onFinal,
  onBargeIn,
}: {
  /** A voice session with a real API (false in text sessions and mock mode). */
  enabled: boolean;
  audio?: SessionAudio;
  /** POST /api/voice/token. */
  getToken: () => Promise<VoiceTokenResponse>;
  /** The tutor holds the floor (controller.tutorHasFloor). */
  floor: boolean;
  speakingId: string | null;
  onFinal: (caption: SttCaption) => void;
  onBargeIn: () => void;
}) {
  const [gate, setGate] = useState<AudioGate>("pending");
  const [textOnly, setTextOnly] = useState(false);
  const [permission, setPermission] = useState<Permission>("unknown");
  const [unavailable, setUnavailable] = useState(false);
  const [userMuted, setUserMuted] = useState(false);
  const [openedDuringTurn, setOpenedDuringTurn] = useState(false);

  const latest = useRef({ floor, speakingId, onFinal, onBargeIn });
  useEffect(() => {
    latest.current = { floor, speakingId, onFinal, onBargeIn };
  });
  const tokenError = useRef<unknown>(null);

  const stt = useStt({
    getToken: async () => {
      try {
        return await getToken();
      } catch (err) {
        tokenError.current = err;
        throw err;
      }
    },
    onSpeechStarted: () => {
      const l = latest.current;
      if (shouldBargeIn(l.floor, l.speakingId)) l.onBargeIn();
    },
    onFinal: (caption) => {
      if (caption.text.trim()) latest.current.onFinal(caption);
    },
  });
  const { state: sttState, start: startStt, setMuted: setSttMuted } = stt;
  const sttStateRef = useRef(sttState);
  useEffect(() => {
    sttStateRef.current = sttState;
  });

  /** Asks for the mic (the browser prompt), then opens the Deepgram stream. Denied / no mic / 503 → text only. */
  const startMic = useCallback(async () => {
    if (sttStateRef.current === "listening" || sttStateRef.current === "muted" || sttStateRef.current === "connecting") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setUnavailable(true);
      return;
    }
    setPermission("asking");
    try {
      // Called synchronously from the gesture; the stream is released at once (useStt opens its own).
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
      setPermission("granted");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") setPermission("denied");
      else {
        setPermission("unknown");
        setUnavailable(true); // NotFoundError: no microphone
      }
      return;
    }
    tokenError.current = null;
    await startStt();
    if (isVoiceUnavailable(tokenError.current)) setUnavailable(true);
  }, [startStt]);

  const starting = useRef(false);
  /** Unlock the audio and ask for the mic. Call it from a click (or with sticky activation). */
  const start = useCallback(async () => {
    if (!enabled || starting.current) return;
    starting.current = true;
    try {
      // Both begin synchronously, inside the gesture: AudioContext.resume() and getUserMedia().
      const unlocking = audio ? audio.unlock() : Promise.resolve(false);
      const mic = startMic();
      setGate((g) => (g === "ready" ? g : "unlocking"));
      const ok = await unlocking;
      setGate(ok ? "ready" : "blocked");
      await mic;
    } finally {
      starting.current = false;
    }
  }, [audio, enabled, startMic]);

  // Session start: with a gesture already on the page (the home card click) start at once; otherwise wait for a tap.
  const decided = useRef(false);
  useEffect(() => {
    if (!enabled || decided.current) return;
    decided.current = true;
    if (hasUserActivation()) void start();
    else setGate("locked");
  }, [enabled, start]);

  // Turn-taking: muted while the tutor talks, open again after script_done and the last speak.
  const shouldMute = micMuted({ userMuted, floor, openedDuringTurn });
  useEffect(() => {
    if (sttState === "listening" && shouldMute) setSttMuted(true);
    else if (sttState === "muted" && !shouldMute) setSttMuted(false);
  }, [sttState, shouldMute, setSttMuted]);
  useEffect(() => {
    if (!floor) setOpenedDuringTurn(false);
  }, [floor]);

  const status: MicStatus = micStatus({ permission, unavailable, sttState, userMuted, floor, openedDuringTurn });

  /** Orb click / mic indicator: mute ↔ listen. While the tutor talks, opening the mic allows barge-in. */
  const toggleMic = useCallback(() => {
    if (!enabled || status === "denied" || status === "unavailable" || status === "asking" || status === "connecting") return;
    if (status === "off" || status === "error") {
      void start();
      return;
    }
    if (status === "listening") {
      setUserMuted(true);
      return;
    }
    setUserMuted(false);
    if (floor) setOpenedDuringTurn(true);
  }, [enabled, floor, start, status]);

  const interim = stt.caption?.kind === "interim" && status === "listening" ? stt.caption.text.trim() : "";

  return {
    gate,
    /** Show the "Toque para ativar o som e o microfone" button. */
    needsTap: enabled && !textOnly && (gate === "locked" || gate === "blocked"),
    /** Audio is on, or the student chose to go on with text: the opening turn may go. */
    canOpen: !enabled || textOnly || gate === "ready",
    status,
    interim,
    start,
    toggleMic,
    continueWithText: () => setTextOnly(true),
  };
}

export type SessionVoice = ReturnType<typeof useSessionVoice>;
