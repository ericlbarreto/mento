"use client";

// Glue between the turn stream and the board: one store + one action queue per session.
// `streamTurn` is injected (same signature as apps/web/src/lib/api.ts) so the dev page can replay fixtures.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, SpeechPlayer, StreamMessage, TurnRequest, WordTiming } from "@mento/contracts";
import {
  type ActionQueue,
  type Caption,
  type HandlerMap,
  type InterruptedPayload,
  type QueueState,
  type RevealMap,
  createActionQueue,
} from "../queue";
import { type SpeechClock, TextSpeechPlayer } from "../speech";
import { type BoardStore, createBoardStore } from "../store";

/**
 * Streams one turn, calling `onMessage` for each message; resolves when the stream ends. On abort it resolves
 * quietly; other failures reject (before the stream starts too, e.g. an HTTP error).
 */
export type StreamTurn = (
  session_id: string,
  req: TurnRequest,
  onMessage: (message: StreamMessage) => void,
  opts?: { signal?: AbortSignal },
) => Promise<void>;

export interface UseTurnPlayerOptions {
  sessionId: string;
  streamTurn: StreamTurn;
  /** Text-mode clock (default TextSpeechPlayer). */
  speech?: SpeechClock;
  /** Voice player for `speak.audio_url` (Person 3). */
  audio?: SpeechPlayer;
  handlers?: HandlerMap;
  reveal?: RevealMap;
  onAlignment?: (action_id: string, words: WordTiming[]) => void;
}

const MAX_WARNINGS = 50;

export interface TurnPlayer {
  store: BoardStore;
  queueState: QueueState;
  caption: Caption | null;
  /** Stream failure or non-recoverable server error for the last turn; cleared by the next sendTurn. */
  error: string | null;
  warnings: string[];
  /** Adds a line to `warnings` (e.g. for the board's onWarning). Stable identity. */
  warn(message: string): void;
  /** Cuts any running turn first, then streams this one (with `interrupted` when a turn was cut). */
  sendTurn(req: Omit<TurnRequest, "interrupted">): Promise<void>;
  /** Stops the tutor now; the payload is also kept for the next request. */
  interrupt(): InterruptedPayload | null;
  pause(): void;
  resume(): void;
  /** Interrupts and empties the board (dev / new topic). */
  clear(): void;
  /**
   * Redraws a reopened session without animation or audio (actions from replayEvents) and remembers its last
   * turn id for the next interruption.
   */
  restore(actions: readonly Action[], lastTurnId: string | null): void;
}

/** One streamed turn. `detached`: superseded after script_done; it only delivers late drawings now. */
interface TurnRun {
  ac: AbortController;
  detached: boolean;
}

export function useTurnPlayer({ sessionId, streamTurn, speech, audio, handlers, reveal, onAlignment }: UseTurnPlayerOptions): TurnPlayer {
  const [queueState, setQueueState] = useState<QueueState>("idle");
  const [caption, setCaption] = useState<Caption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Created once, without render side effects (StrictMode may call initializers twice; that is harmless).
  const [core] = useState(() => {
    const warn = (w: string) => setWarnings((ws) => [...ws.slice(-(MAX_WARNINGS - 1)), w]);
    const store = createBoardStore({ onWarning: warn });
    const queue: ActionQueue = createActionQueue({
      store,
      speech: speech ?? new TextSpeechPlayer(),
      audio,
      handlers,
      reveal,
      onCaption: setCaption,
      onAlignment,
      onError: (e) => (e.recoverable ? warn(`stream error ${e.code} (recoverable): ${e.message}`) : setError(e.message)),
      onWarning: warn,
      onStateChange: setQueueState,
    });
    return { store, queue, warn };
  });
  const { store, queue, warn } = core;

  const run = useRef<TurnRun | null>(null);
  const detachedRuns = useRef(new Set<TurnRun>());
  const pendingInterrupted = useRef<InterruptedPayload | null>(null);
  const streamRef = useRef(streamTurn);
  useEffect(() => {
    streamRef.current = streamTurn;
  }, [streamTurn]);

  /**
   * Synchronous cut: stop the queue and remember how far the tutor got. A stream still in its script is
   * aborted; one whose script is done stays open only to deliver late drawings (draw_result).
   */
  const cut = useCallback((): InterruptedPayload | null => {
    const r = run.current;
    run.current = null;
    const scriptDone = queue.isScriptDone();
    const payload = queue.interrupt();
    if (payload) pendingInterrupted.current = payload;
    if (r) {
      if (scriptDone) {
        r.detached = true;
        detachedRuns.current.add(r);
      } else r.ac.abort();
    }
    return payload;
  }, [queue]);

  const sendTurn = useCallback(
    async (req: Omit<TurnRequest, "interrupted">) => {
      cut();
      const interrupted = pendingInterrupted.current;
      pendingInterrupted.current = null;
      const body: TurnRequest = interrupted ? { ...req, interrupted } : req;
      const r: TurnRun = { ac: new AbortController(), detached: false };
      run.current = r;
      setError(null);
      queue.beginTurn();
      const onMessage = (msg: StreamMessage) => {
        if (r.ac.signal.aborted) return;
        if (!r.detached) {
          queue.push(msg);
          return;
        }
        // Superseded turn: apply late drawings to placeholders still on the board, nothing else.
        if (msg.type === "action" && msg.action.name === "draw_result") {
          if (store.getElement(msg.action.args.element_id)?.status === "placeholder") store.dispatch(msg.action);
        }
        if (msg.type === "turn_done") r.ac.abort();
      };
      try {
        await streamRef.current(sessionId, body, onMessage, { signal: r.ac.signal });
        if (!r.detached && !r.ac.signal.aborted) queue.endTurn();
      } catch (err) {
        if (r.ac.signal.aborted || r.detached) return;
        setError(err instanceof Error ? err.message : String(err));
        queue.endTurn();
      } finally {
        if (run.current === r) run.current = null;
        detachedRuns.current.delete(r);
      }
    },
    [cut, queue, sessionId, store],
  );

  const clear = useCallback(() => {
    cut();
    for (const r of detachedRuns.current) r.ac.abort();
    detachedRuns.current.clear();
    pendingInterrupted.current = null;
    store.reset();
    setCaption(null);
    setError(null);
    setWarnings([]);
  }, [cut, store]);

  const restore = useCallback(
    (actions: readonly Action[], lastTurnId: string | null) => {
      for (const action of actions) store.dispatch(action);
      queue.setLastTurnId(lastTurnId);
    },
    [queue, store],
  );

  // Stop everything on unmount. Deferred one tick so StrictMode's simulated unmount/remount in dev
  // (which re-runs this effect right away) does not abort the first turn.
  const disposeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(disposeTimer.current);
    const detached = detachedRuns.current;
    return () => {
      disposeTimer.current = setTimeout(() => {
        cut();
        run.current?.ac.abort();
        for (const r of detached) r.ac.abort();
        detached.clear();
      }, 0);
    };
  }, [cut]);

  return {
    store,
    queueState,
    caption,
    error,
    warnings,
    warn,
    sendTurn,
    interrupt: cut,
    pause: queue.pause,
    resume: queue.resume,
    clear,
    restore,
  };
}
