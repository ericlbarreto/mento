import type { Citation, SpeechPurpose, TutorAction, TutorActionName } from "../protocol";
import type { SpeechPlayer } from "../speech";
import type { BoardStore, ElementState } from "../store";

/** What the UI shows: thinking = turn requested, no action played yet; waiting_answer = after ask_verification. */
export type QueueState = "idle" | "thinking" | "playing" | "waiting_answer" | "paused";

export interface Caption {
  action_id: string;
  text: string;
  sources?: Citation[];
  outside_material?: boolean;
  purpose?: SpeechPurpose;
}

export type ActionOf<N extends TutorActionName> = Extract<TutorAction, { name: N }>;

/** Everything a handler may touch. `signal` aborts when the turn is interrupted or replaced. */
export interface HandlerContext {
  store: BoardStore;
  speech: SpeechPlayer;
  signal: AbortSignal;
  setCaption(caption: Caption): void;
  /** Awaits the reveal hook registered for this action (default: resolves immediately). */
  reveal(action: TutorAction): Promise<void>;
  /** Accumulated `{stream:"svg"}` chunks for an element, removed once taken. */
  takeSvg(elementId: string): string | undefined;
  markWaitingAnswer(): void;
  warn(message: string): void;
}

export type ActionHandler<N extends TutorActionName = TutorActionName> = (
  action: ActionOf<N>,
  ctx: HandlerContext,
) => void | Promise<void>;

export type HandlerMap = { [N in TutorActionName]?: ActionHandler<N> };

/**
 * Animation hook for an action, keyed by action name (e.g. the typewriter for write_text, the stroke for
 * circle_annotate). Runs after the store change; the queue waits for it. Must resolve promptly on `signal`.
 */
export type RevealHook = (action: TutorAction, element: ElementState | undefined, signal: AbortSignal) => Promise<void>;
export type RevealMap = { [N in TutorActionName]?: RevealHook };
