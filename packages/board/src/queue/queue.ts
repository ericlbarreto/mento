// Single ordered playback of one turn (docs/16 §3.3). Actions may arrive out of `order`; they are buffered
// and played strictly ascending, one at a time. `speak` gates the next action, `draw` does not.
// Stream lifecycle: actions… → script_done (no more script; late results such as draw_result may follow)
// → turn_done. interrupt() is synchronous so new user input cuts the tutor in < 100 ms.
import type { Action, SpeechPlayer, StreamMessage, WordTiming } from "../protocol";
import { type SpeechClock, TextSpeechPlayer } from "../speech";
import type { BoardStore } from "../store";
import { defaultHandlers } from "./handlers";
import type {
  ActionHandler,
  Caption,
  HandlerContext,
  HandlerMap,
  InterruptedPayload,
  QueueState,
  RevealMap,
  StreamError,
} from "./types";

/** Cap on streamed SVG per element (~200 KB); later chunks are dropped with a warning. */
export const MAX_SVG_CHARS = 200_000;

export interface ActionQueueOptions {
  store: BoardStore;
  /** Text-mode clock; defaults to TextSpeechPlayer. */
  speech?: SpeechClock;
  /** Voice player for `speak.audio_url` (Person 3's @mento/voice/client). */
  audio?: SpeechPlayer;
  /** Overrides merged over `defaultHandlers` (one entry per action name). */
  handlers?: HandlerMap;
  reveal?: RevealMap;
  onCaption?: (caption: Caption) => void;
  onAlignment?: (action_id: string, words: WordTiming[]) => void;
  onError?: (error: StreamError) => void;
  onWarning?: (message: string) => void;
  onStateChange?: (state: QueueState) => void;
}

export interface ActionQueue {
  /** Call when a turn is requested, before the stream answers (state → "thinking"). */
  beginTurn(): void;
  push(message: StreamMessage): void;
  /** The stream closed (with or without turn_done): play what arrived and finish the turn. */
  endTurn(): void;
  pause(): void;
  resume(): void;
  /**
   * Stops speech, drops pending actions, keeps the board. Returns the `interrupted` payload, or null when
   * nothing was cut or the turn id is not known yet (it only arrives with script_done / turn_done).
   */
  interrupt(): InterruptedPayload | null;
  getState(): QueueState;
  /** True once script_done (or turn_done) arrived for the current turn. */
  isScriptDone(): boolean;
  /** Word timings received for a speak action (speech_alignment). */
  getAlignment(action_id: string): WordTiming[] | undefined;
  readonly speech: SpeechClock;
}

export function createActionQueue(opts: ActionQueueOptions): ActionQueue {
  const { store, audio } = opts;
  const speech = opts.speech ?? new TextSpeechPlayer();
  const handlers: HandlerMap = { ...defaultHandlers, ...opts.handlers };
  const warn = (m: string) => opts.onWarning?.(m);

  // Turn state. `generation` invalidates in-flight handlers after interrupt / a new turn.
  let generation = 0;
  let abort = new AbortController();
  let turnId: string | null = null;
  let turnActive = false;
  let scriptDone = false;
  let turnDone = false;
  let playedAny = false;
  let waitingAnswer = false;
  let paused = false;
  let running = false;
  let current: Action | null = null;
  let nextOrder = 0;
  const pending = new Map<number, Action>();
  const svgChunks = new Map<string, string[]>();
  const oversized = new Set<string>();
  const alignments = new Map<string, WordTiming[]>();
  // Speak timing, for interrupted.spoken_ms.
  let speakStartedAt = 0;
  let pausedAt = 0;
  let pausedTotal = 0;

  let lastState: QueueState = "idle";
  const derive = (): QueueState => {
    if (paused) return "paused";
    if (current) return "playing";
    if (turnActive && !scriptDone) return playedAny ? "playing" : "thinking";
    if (pending.size > 0) return "playing";
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
    audio?.stop();
    pending.clear();
    svgChunks.clear();
    oversized.clear();
    alignments.clear();
    running = false;
    current = null;
    nextOrder = 0;
    turnId = null;
    scriptDone = false;
    turnDone = false;
    playedAny = false;
    waitingAnswer = false;
    paused = false;
    pausedTotal = 0;
  };

  const makeContext = (signal: AbortSignal): HandlerContext => ({
    store,
    speech,
    audio,
    signal,
    setCaption: (c) => opts.onCaption?.(c),
    reveal: async (action) => {
      const hook = opts.reveal?.[action.name];
      if (!hook) return;
      const id = elementIdOf(action);
      await hook(action, id ? store.getElement(id) : undefined, signal);
    },
    markWaitingAnswer: () => {
      waitingAnswer = true;
    },
    warn,
  });

  /** Next action to play: the next `order`, or (once the turn is done) skip a gap with a warning. */
  const takeNext = (): Action | undefined => {
    let action = pending.get(nextOrder);
    if (!action && turnDone && pending.size > 0) {
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

  /** Streamed SVGs are applied once the turn is done (all chunks in, the draw placeholder played). */
  const flushSvg = () => {
    for (const [element_id, chunks] of svgChunks) store.applySvg(element_id, chunks.join(""));
    svgChunks.clear();
  };

  const pump = async () => {
    if (running || paused) return;
    running = true;
    const gen = generation;
    const ctx = makeContext(abort.signal);
    try {
      for (;;) {
        if (paused) break;
        const action = takeNext();
        if (!action) break;
        current = action;
        playedAny = true;
        if (action.name === "speak") {
          speakStartedAt = Date.now();
          pausedTotal = 0;
        }
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
      if (!paused && turnDone && pending.size === 0) {
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

  const finish = () => {
    scriptDone = true;
    turnDone = true;
    emit();
    void pump();
  };

  /** How far the current speak got: ms from alignment-free wall clock; chars from words or text progress. */
  const speakProgress = (action: Extract<Action, { name: "speak" }>) => {
    const now = Date.now();
    const spoken_ms = Math.max(0, now - speakStartedAt - pausedTotal - (paused ? now - pausedAt : 0));
    const words = alignments.get(action.id);
    let spoken_chars: number | undefined;
    if (words) {
      const said = words.filter((w) => w.end_ms <= spoken_ms).map((w) => w.word);
      spoken_chars = said.length ? Math.min(action.args.text.length, said.join(" ").length) : 0;
    } else if (!(action.args.audio_url && audio) && speech.progress) {
      spoken_chars = Math.round(speech.progress() * action.args.text.length);
    }
    return { spoken_ms: Math.round(spoken_ms), spoken_chars };
  };

  return {
    speech,
    getState: derive,
    isScriptDone: () => scriptDone,
    getAlignment: (id) => alignments.get(id),

    beginTurn() {
      resetTurn();
      turnActive = true;
      emit();
    },

    push(msg) {
      switch (msg.type) {
        case "action": {
          if (!turnActive) turnActive = true;
          if (msg.order < nextOrder || pending.has(msg.order)) {
            warn(`duplicate order ${msg.order} (${msg.action.id}); ignored`);
            return;
          }
          pending.set(msg.order, msg.action);
          void pump();
          return;
        }
        case "svg_chunk": {
          const chunks = svgChunks.get(msg.element_id) ?? [];
          const size = chunks.reduce((n, c) => n + c.length, 0);
          if (size + msg.chunk.length > MAX_SVG_CHARS) {
            if (!oversized.has(msg.element_id)) {
              oversized.add(msg.element_id);
              warn(`svg stream for "${msg.element_id}" over ${MAX_SVG_CHARS} chars; rest dropped`);
            }
            return;
          }
          chunks.push(msg.chunk);
          svgChunks.set(msg.element_id, chunks);
          return;
        }
        case "speech_alignment":
          alignments.set(msg.action_id, msg.words);
          opts.onAlignment?.(msg.action_id, msg.words);
          return;
        case "script_done":
          turnId = msg.turn_id;
          scriptDone = true;
          emit();
          return;
        case "turn_done":
          turnId = msg.turn_id;
          finish();
          return;
        case "error":
          opts.onError?.({ code: msg.code, message: msg.message, recoverable: msg.recoverable });
          if (!msg.recoverable) finish(); // play what already arrived, then stop
          return;
      }
    },

    endTurn() {
      if (!turnDone) finish();
    },

    pause() {
      if (paused) return;
      paused = true;
      pausedAt = Date.now();
      speech.pause?.();
      emit();
    },

    resume() {
      if (!paused) return;
      paused = false;
      pausedTotal += Date.now() - pausedAt;
      speech.resume?.();
      emit();
      void pump();
    },

    interrupt() {
      const cut = current !== null || pending.size > 0 || (turnActive && !scriptDone);
      let payload: InterruptedPayload | null = null;
      if (cut && turnId) {
        payload = { turn_id: turnId };
        if (current) {
          payload.action_id = current.id;
          if (current.name === "speak") {
            const { spoken_ms, spoken_chars } = speakProgress(current);
            payload.spoken_ms = spoken_ms;
            if (spoken_chars !== undefined) payload.spoken_chars = spoken_chars;
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
export function elementIdOf(action: Action): string | undefined {
  const args = action.args as { id?: string; target_id?: string; element_id?: string };
  return args.target_id ?? args.element_id ?? args.id;
}
