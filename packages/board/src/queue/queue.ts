// Single ordered playback of one turn's script (docs/16 §3.3). Messages may arrive out of `order`;
// actions are buffered and played strictly ascending, one at a time. `speak` gates the next action,
// `draw` does not. interrupt() is synchronous so a new user input cuts the tutor in < 100 ms.
import type { Interrupted, TutorAction, TurnStreamMessage } from "../protocol";
import { type SpeechPlayer, TextSpeechPlayer } from "../speech";
import type { BoardStore } from "../store";
import { defaultHandlers } from "./handlers";
import type { ActionHandler, Caption, HandlerContext, HandlerMap, QueueState, RevealMap } from "./types";

export interface ActionQueueOptions {
  store: BoardStore;
  speech?: SpeechPlayer;
  /** Overrides merged over `defaultHandlers` (one entry per action name). */
  handlers?: HandlerMap;
  reveal?: RevealMap;
  onCaption?: (caption: Caption) => void;
  onError?: (message: string) => void;
  onWarning?: (message: string) => void;
  onStateChange?: (state: QueueState) => void;
}

export interface ActionQueue {
  /** Call when a turn is requested, before the stream answers (state → "thinking"). */
  beginTurn(): void;
  push(message: TurnStreamMessage): void;
  pause(): void;
  resume(): void;
  /** Stops speech, drops pending actions, keeps the board. Returns null when no turn was cut. */
  interrupt(): Interrupted | null;
  getState(): QueueState;
  readonly speech: SpeechPlayer;
}

export function createActionQueue(opts: ActionQueueOptions): ActionQueue {
  const { store } = opts;
  const speech = opts.speech ?? new TextSpeechPlayer();
  const handlers: HandlerMap = { ...defaultHandlers, ...opts.handlers };
  const warn = (m: string) => opts.onWarning?.(m);

  // Turn state. `generation` invalidates in-flight handlers after interrupt / a new turn.
  let generation = 0;
  let abort = new AbortController();
  let turnId: string | null = null;
  let turnActive = false;
  let done = false;
  let playedAny = false;
  let waitingAnswer = false;
  let paused = false;
  let running = false;
  let current: TutorAction | null = null;
  let nextOrder = 0;
  const pending = new Map<number, TutorAction>();
  const svgChunks = new Map<string, string[]>();

  let lastState: QueueState = "idle";
  const derive = (): QueueState => {
    if (paused) return "paused";
    if (current) return "playing";
    if (turnActive && (!done || pending.size > 0)) return playedAny ? "playing" : "thinking";
    return waitingAnswer ? "waiting_answer" : "idle";
  };
  const emit = () => {
    const s = derive();
    if (s === lastState) return;
    lastState = s;
    opts.onStateChange?.(s);
  };

  const resetTurn = () => {
    generation++;
    abort.abort();
    abort = new AbortController();
    speech.stop();
    pending.clear();
    svgChunks.clear();
    running = false;
    current = null;
    nextOrder = 0;
    done = false;
    playedAny = false;
    waitingAnswer = false;
    paused = false;
  };

  const makeContext = (signal: AbortSignal): HandlerContext => ({
    store,
    speech,
    signal,
    setCaption: (c) => opts.onCaption?.(c),
    reveal: async (action) => {
      const hook = opts.reveal?.[action.name];
      if (!hook) return;
      const id = elementIdOf(action);
      await hook(action, id ? store.getElement(id) : undefined, signal);
    },
    takeSvg: (id) => {
      const chunks = svgChunks.get(id);
      svgChunks.delete(id);
      return chunks?.join("");
    },
    markWaitingAnswer: () => {
      waitingAnswer = true;
    },
    warn,
  });

  /** Next action to play: the next `order`, or (once the stream is done) skip a gap with a warning. */
  const takeNext = (): TutorAction | undefined => {
    let action = pending.get(nextOrder);
    if (!action && done && pending.size > 0) {
      const lowest = Math.min(...pending.keys());
      warn(`missing order ${nextOrder}..${lowest - 1}; skipped`);
      nextOrder = lowest;
      action = pending.get(lowest);
    }
    if (!action) return undefined;
    pending.delete(nextOrder);
    nextOrder++;
    return action;
  };

  /** Streamed SVGs with no draw_result: applied when the turn completes. */
  const flushSvg = () => {
    for (const [element_id, chunks] of svgChunks) {
      svgChunks.delete(element_id);
      const el = store.getElement(element_id);
      if (!el) {
        warn(`svg stream for unknown element "${element_id}"`);
        continue;
      }
      store.dispatch({ id: `svg_${element_id}`, name: "draw_result", args: { element_id, svg: chunks.join("") } });
    }
  };

  const pump = async () => {
    if (running || paused) return;
    running = true;
    const gen = generation;
    const signal = abort.signal;
    const ctx = makeContext(signal);
    try {
      for (;;) {
        if (paused) break;
        const action = takeNext();
        if (!action) break;
        current = action;
        playedAny = true;
        emit();
        const handler = handlers[action.name] as ActionHandler | undefined;
        try {
          if (handler) await handler(action, ctx);
          else warn(`no handler for "${action.name}"`);
        } catch (err) {
          if (gen !== generation) return;
          warn(`${action.name} (${action.id}) failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (gen !== generation) return; // interrupted while awaiting: the new turn owns the state
        current = null;
      }
      if (!paused && done && pending.size === 0) {
        flushSvg();
        turnActive = false;
      }
    } finally {
      if (gen === generation) {
        running = false;
        emit();
      }
    }
  };

  return {
    speech,
    getState: derive,

    beginTurn() {
      resetTurn();
      turnId = null;
      turnActive = true;
      emit();
    },

    push(msg) {
      if ("turn_id" in msg) {
        if (turnId !== msg.turn_id && (playedAny || pending.size > 0)) resetTurn();
        turnId = msg.turn_id;
        turnActive = true;
        emit();
        return;
      }
      if ("order" in msg) {
        if (!turnActive) {
          turnActive = true;
          done = false;
        }
        if (msg.order < nextOrder || pending.has(msg.order)) {
          warn(`duplicate order ${msg.order} (${msg.action.id}); ignored`);
          return;
        }
        pending.set(msg.order, msg.action);
        void pump();
        return;
      }
      if ("stream" in msg) {
        const chunks = svgChunks.get(msg.element_id) ?? [];
        chunks.push(msg.chunk);
        svgChunks.set(msg.element_id, chunks);
        return;
      }
      if ("error" in msg) {
        opts.onError?.(msg.error.message);
        done = true; // play what already arrived, then stop
        void pump().then(emit);
        return;
      }
      // done
      done = true;
      if (!running) void pump();
      emit();
    },

    pause() {
      if (paused) return;
      paused = true;
      speech.pause?.();
      emit();
    },

    resume() {
      if (!paused) return;
      paused = false;
      speech.resume?.();
      emit();
      void pump();
    },

    interrupt() {
      const cut = turnActive || current !== null || pending.size > 0;
      let payload: Interrupted | null = null;
      if (cut && turnId) {
        payload = { turn_id: turnId };
        if (current) {
          payload.action_id = current.id;
          if (current.name === "speak" && speech.progress) {
            payload.spoken_chars = Math.round(speech.progress() * current.args.text.length);
          }
        }
      }
      resetTurn();
      turnActive = false;
      emit();
      return payload;
    },
  };
}

/** The board element an action creates or targets (undefined for speak). */
export function elementIdOf(action: TutorAction): string | undefined {
  const args = action.args as { id?: string; target_id?: string; element_id?: string };
  return args.target_id ?? args.element_id ?? args.id;
}
