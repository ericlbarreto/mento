// Owner: Person 2. Pure turn-taking rules of a voice session (docs/frontend-rendering-guide.md §6 and §8), kept
// out of React so they are unit-tested: when the tutor holds the floor, when the mic is muted, what the orb and
// the mic indicator show.
import type { QueueState } from "@mento/board";
import type { OrbState } from "@mento/ui";
import { classifyBargeIn } from "@mento/voice/client";

/**
 * The tutor holds the floor from the moment a turn is sent until its script is done AND the queue played it
 * (the last `speak` ended). Pausing keeps it; an interruption gives it back (turnOpen false).
 */
export function tutorHasFloor({ turnOpen, scriptDone, queueState }: { turnOpen: boolean; scriptDone: boolean; queueState: QueueState }): boolean {
  if (!turnOpen) return false;
  if (!scriptDone) return true;
  return queueState === "thinking" || queueState === "playing" || queueState === "paused";
}

/**
 * The mic stays open while the tutor talks, so the student can interrupt through speakers (no headphones): the
 * browser cancels the echo (echoCancellation in startMic) and `judgeCaption` ignores what still leaks through.
 * Only the student's own mute closes it.
 */
export const micMuted = ({ userMuted }: { userMuted: boolean }): boolean => userMuted;

/** Barge-in only while the tutor has the floor; otherwise speech is just the student's next message. */
export const shouldBargeIn = (floor: boolean, speakingId: string | null) => floor || speakingId !== null;

/** The tutor's voice can still reach the mic (and Deepgram) this long after its last word. */
export const ECHO_TAIL_MS = 1500;

export type CaptionVerdict = "wait" | "drop" | "send" | "interrupt" | "interrupt_and_send";

/**
 * What to do with a caption from the speech-to-text stream. While the tutor talks, speech counts only if the words
 * differ from what the tutor is saying (two words in an interim caption, one in a final one): a caption copied
 * from the tutor is echo and is dropped. Once the tutor is quiet a final caption is the student's next message.
 */
export function judgeCaption({ kind, text, tutorActive, tutorText }: { kind: "interim" | "final"; text: string; tutorActive: boolean; tutorText: string }): CaptionVerdict {
  if (!tutorActive) return kind === "final" && text.trim() ? "send" : "wait";
  const { decision } = classifyBargeIn({ transcript: text, kind, tutorText });
  if (decision === "interrupt") return kind === "final" ? "interrupt_and_send" : "interrupt";
  return kind === "final" ? "drop" : "wait";
}

/** What the mic indicator shows. */
export type MicStatus = "off" | "asking" | "connecting" | "listening" | "muted" | "denied" | "unavailable" | "error";

export function micStatus({
  permission,
  unavailable,
  sttState,
  userMuted,
}: {
  permission: "unknown" | "asking" | "granted" | "denied";
  unavailable: boolean;
  sttState: "idle" | "connecting" | "listening" | "muted" | "error";
  userMuted: boolean;
}): MicStatus {
  if (permission === "denied") return "denied";
  if (unavailable) return "unavailable";
  if (permission === "asking") return "asking";
  if (sttState === "error") return "error";
  if (sttState === "connecting") return "connecting";
  if (sttState === "idle") return "off";
  if (userMuted) return "muted";
  return micMuted({ userMuted }) ? "muted" : "listening";
}

/** The orb listens when the mic is open and the tutor is not busy (an open question keeps "waiting"). */
export function voiceOrbState(base: OrbState, mic: MicStatus): OrbState {
  return base === "idle" && mic === "listening" ? "listening" : base;
}

/** pt-BR label of the mic indicator. */
export const MIC_LABEL: Record<MicStatus, string> = {
  off: "Microfone desligado",
  asking: "Permitir microfone…",
  connecting: "Conectando o microfone…",
  listening: "Ouvindo você",
  muted: "Microfone mudo",
  denied: "Microfone bloqueado",
  unavailable: "Voz indisponível",
  error: "Microfone com problema",
};
