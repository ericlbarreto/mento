// Owner: Person 2. Pure turn-taking rules of a voice session (docs/frontend-rendering-guide.md §6 and §8), kept
// out of React so they are unit-tested: when the tutor holds the floor, when the mic is muted, what the orb and
// the mic indicator show.
import type { QueueState } from "@mento/board";
import type { OrbState } from "@mento/ui";

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
 * Mic muted while the tutor talks (no headphones assumed, so its voice cannot cut itself), unless the student
 * opened it on purpose during this turn (orb click: barge-in with headphones). Always muted when the student
 * turned it off.
 */
export function micMuted({ userMuted, floor, openedDuringTurn }: { userMuted: boolean; floor: boolean; openedDuringTurn: boolean }): boolean {
  if (userMuted) return true;
  return floor && !openedDuringTurn;
}

/** Barge-in only while the tutor has the floor; otherwise speech is just the student's next message. */
export const shouldBargeIn = (floor: boolean, speakingId: string | null) => floor || speakingId !== null;

/** What the mic indicator shows. "held": muted by turn-taking while the tutor talks. */
export type MicStatus = "off" | "asking" | "connecting" | "listening" | "held" | "muted" | "denied" | "unavailable" | "error";

export function micStatus({
  permission,
  unavailable,
  sttState,
  userMuted,
  floor,
  openedDuringTurn,
}: {
  permission: "unknown" | "asking" | "granted" | "denied";
  unavailable: boolean;
  sttState: "idle" | "connecting" | "listening" | "muted" | "error";
  userMuted: boolean;
  floor: boolean;
  openedDuringTurn: boolean;
}): MicStatus {
  if (permission === "denied") return "denied";
  if (unavailable) return "unavailable";
  if (permission === "asking") return "asking";
  if (sttState === "error") return "error";
  if (sttState === "connecting") return "connecting";
  if (sttState === "idle") return "off";
  if (userMuted) return "muted";
  return micMuted({ userMuted, floor, openedDuringTurn }) ? "held" : "listening";
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
  held: "Microfone em espera",
  muted: "Microfone mudo",
  denied: "Microfone bloqueado",
  unavailable: "Voz indisponível",
  error: "Microfone com problema",
};
