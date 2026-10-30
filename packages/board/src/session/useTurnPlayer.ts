"use client";

// Glue between the turn stream and the board: one store + one action queue per session.
// `streamTurn` is injected (same signature as apps/web/src/lib/api.ts) so the dev page can replay fixtures.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Interrupted, TurnRequest, TurnStreamMessage } from "../protocol";
import { type ActionQueue, type Caption, type HandlerMap, type QueueState, type RevealMap, createActionQueue } from "../queue";
import { type SpeechPlayer, TextSpeechPlayer } from "../speech";
import { type BoardStore, createBoardStore } from "../store";

export type StreamTurn = (
  session_id: string,
  req: TurnRequest,
  opts?: { signal?: AbortSignal },
) => AsyncIterable<TurnStreamMessage>;

export interface UseTurnPlayerOptions {
  sessionId: string;
  streamTurn: StreamTurn;
  speechPlayer?: SpeechPlayer;
  handlers?: HandlerMap;
  reveal?: RevealMap;
}

const MAX_WARNINGS = 50;

export interface TurnPlayer {
  store: BoardStore;
  queueState: QueueState;
  caption: Caption | null;
  /** Stream failure or server `{error}` for the last turn; cleared by the next sendTurn. */
  error: string | null;
  warnings: string[];
  /** Adds a line to `warnings` (e.g. for the board's onWarning). Stable identity. */
  warn(message: string): void;
  /** Cuts any running turn first, then streams this one (with `interrupted` when a turn was cut). */
  sendTurn(req: Omit<TurnRequest, "interrupted">): Promise<void>;
  /** Stops the tutor now; the payload is also kept for the next request. */
  interrupt(): Interrupted | null;
  pause(): void;
  resume(): void;
  /** Interrupts and empties the board (dev / new topic). */
  clear(): void;
}

export function useTurnPlayer({ sessionId, streamTurn, speechPlayer, handlers, reveal }: UseTurnPlayerOptions): TurnPlayer {
  const [queueState, setQueueState] = useState<QueueState>("idle");
  const [caption, setCaption] = useState<Caption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Created once, outside render side effects (StrictMode may call initializers twice; that is harmless).
  const [core] = useState(() => {
    const warn = (w: string) => setWarnings((ws) => [...ws.slice(-(MAX_WARNINGS - 1)), w]);
    const store = createBoardStore({ onWarning: warn });
    const queue: ActionQueue = createActionQueue({
      store,
      speech: speechPlayer ?? new TextSpeechPlayer(),
      handlers,
      reveal,
      onCaption: setCaption,
      onError: setError,
      onWarning: warn,
      onStateChange: setQueueState,
    });
    return { store, queue, warn };
  });
  const { store, queue, warn } = core;

  const controller = useRef<AbortController | null>(null);
  const pendingInterrupted = useRef<Interrupted | null>(null);
  const streamRef = useRef(streamTurn);
  streamRef.current = streamTurn;

  /** Synchronous cut: abort the stream and the queue; remember how far the tutor got. */
  const cut = useCallback((): Interrupted | null => {
    controller.current?.abort();
    controller.current = null;
    const payload = queue.interrupt();
    if (payload) pendingInterrupted.current = payload;
    return payload;
  }, [queue]);

  const sendTurn = useCallback(
    async (req: Omit<TurnRequest, "interrupted">) => {
      cut();
      const interrupted = pendingInterrupted.current;
      pendingInterrupted.current = null;
      const body: TurnRequest = interrupted ? { ...req, interrupted } : req;
      const ac = new AbortController();
      controller.current = ac;
      setError(null);
      queue.beginTurn();
      let sawDone = false;
      try {
        for await (const msg of streamRef.current(sessionId, body, { signal: ac.signal })) {
          if (ac.signal.aborted) return;
          if ("done" in msg) sawDone = true;
          queue.push(msg);
        }
        // A stream that ends without {done} still finishes its script.
        if (!ac.signal.aborted && !sawDone) queue.push({ done: true });
      } catch (err) {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        queue.push({ done: true });
      } finally {
        if (controller.current === ac) controller.current = null;
      }
    },
    [cut, queue, sessionId],
  );

  const clear = useCallback(() => {
    cut();
    pendingInterrupted.current = null;
    store.reset();
    setCaption(null);
    setError(null);
    setWarnings([]);
  }, [cut, store]);

  // Stop everything on unmount. Deferred one tick so StrictMode's simulated unmount/remount in dev
  // (which re-runs this effect right away) does not abort the first turn.
  const disposeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(disposeTimer.current);
    return () => {
      disposeTimer.current = setTimeout(cut, 0);
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
  };
}
