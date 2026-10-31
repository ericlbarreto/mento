import type { z } from "zod";
import type { Action, ActionName, Citation, Interrupted, SpeechPlayer } from "@mento/contracts";
import type { SpeechClock } from "../speech";
import type { BoardStore, ElementState } from "../store";

/** Payload of TurnRequest.interrupted. */
export type InterruptedPayload = z.infer<typeof Interrupted>;

/**
 * What the UI shows: thinking = turn requested, no action played yet; waiting_answer = the script ended
 * on an ask_verification.
 */
export type QueueState = "idle" | "thinking" | "playing" | "waiting_answer" | "paused";

export type SpeakAction = Extract<Action, { name: "speak" }>;

export interface Caption {
  action_id: string;
  text: string;
  sources?: Citation[];
  outside_material?: boolean;
  purpose?: SpeakAction["args"]["purpose"];
}

export interface StreamError {
  code: string;
  message: string;
  recoverable: boolean;
}

export type ActionOf<N extends ActionName> = Extract<Action, { name: N }>;

/** Everything a handler may touch. `signal` aborts when the turn is interrupted or replaced. */
export interface HandlerContext {
  store: BoardStore;
  /** Text-mode clock (reading time). */
  speech: SpeechClock;
  /** Voice player for `speak.audio_url` (absent in text mode). */
  audio?: SpeechPlayer;
  signal: AbortSignal;
  setCaption(caption: Caption): void;
  /** Awaits the reveal hook registered for this action (default: resolves immediately). */
  reveal(action: Action): Promise<void>;
  markWaitingAnswer(): void;
  warn(message: string): void;
}

export type ActionHandler<N extends ActionName = ActionName> = (action: ActionOf<N>, ctx: HandlerContext) => void | Promise<void>;

export type HandlerMap = { [N in ActionName]?: ActionHandler<N> };

/**
 * Animation hook for an action, keyed by action name (e.g. the typewriter for write_text, the stroke for
 * circle_annotate). Runs after the store change; the queue waits for it. Must resolve promptly on `signal`.
 */
export type RevealHook = (action: Action, element: ElementState | undefined, signal: AbortSignal) => Promise<void>;
export type RevealMap = { [N in ActionName]?: RevealHook };
