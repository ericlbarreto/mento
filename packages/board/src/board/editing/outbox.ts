// The student's board edits on their way to the API (plan F). Moves go out at once. A delete is held while its
// undo toast is open (6 s, paused on hover/focus) and only sent when the toast closes, on pagehide (keepalive) or
// right before the next turn, so undo never needs a "restore" event on the server.
import type { BoardEditRequest } from "@mento/contracts";
import type { RemovedElement } from "../../store";

type RemoveRequest = Extract<BoardEditRequest, { op: "remove" }>;
export type SendEdit = (edit: BoardEditRequest, opts: { keepalive?: boolean }) => Promise<unknown>;

export interface HeldRemove {
  edit: RemoveRequest;
  removed: RemovedElement;
}

export interface EditOutbox {
  /** Sends a move now. */
  send(edit: BoardEditRequest): void;
  /** Holds a delete for the undo window; a delete already held is sent first (undo is for the last one only). */
  hold(edit: RemoveRequest, removed: RemovedElement): void;
  /** Undo: drops the held delete (never sent) and returns what to put back. */
  undo(): RemovedElement | null;
  /** Sends the held delete now. Resolves when every edit in flight is done; null when there is nothing to wait for. */
  flush(opts?: { keepalive?: boolean }): Promise<void> | null;
  /** The toast is hovered or focused: the undo window stops counting. */
  pauseTimer(): void;
  resumeTimer(): void;
  held(): HeldRemove | null;
  /** Called when the held delete changes (toast open / closed). */
  subscribe(listener: () => void): () => void;
}

export const UNDO_MS = 6000;

export function createEditOutbox({
  send,
  holdMs = UNDO_MS,
  onError,
}: {
  send: SendEdit;
  holdMs?: number;
  onError?: (edit: BoardEditRequest, err: unknown) => void;
}): EditOutbox {
  let current: HeldRemove | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let left = holdMs;
  let startedAt = 0;
  let paused = false;
  const inFlight = new Set<Promise<void>>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const go = (edit: BoardEditRequest, opts: { keepalive?: boolean } = {}) => {
    const p: Promise<void> = Promise.resolve()
      .then(() => send(edit, opts))
      .then(
        () => undefined,
        (err: unknown) => onError?.(edit, err),
      )
      .finally(() => inFlight.delete(p));
    inFlight.add(p);
  };
  const startTimer = () => {
    clearTimeout(timer);
    startedAt = Date.now();
    timer = setTimeout(() => void outbox.flush(), left);
  };
  const release = (opts?: { keepalive?: boolean }) => {
    const h = current;
    if (!h) return;
    clearTimeout(timer);
    current = null;
    go(h.edit, opts);
    emit();
  };

  const outbox: EditOutbox = {
    send: (edit) => go(edit),
    hold(edit, removed) {
      release();
      current = { edit, removed };
      left = holdMs;
      paused = false;
      startTimer();
      emit();
    },
    undo() {
      const h = current;
      if (!h) return null;
      clearTimeout(timer);
      current = null;
      emit();
      return h.removed;
    },
    flush(opts) {
      release(opts);
      return inFlight.size > 0 ? Promise.all([...inFlight]).then(() => undefined) : null;
    },
    pauseTimer() {
      if (!current || paused) return;
      paused = true;
      clearTimeout(timer);
      left = Math.max(0, left - (Date.now() - startedAt));
    },
    resumeTimer() {
      if (!current || !paused) return;
      paused = false;
      startTimer();
    },
    held: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return outbox;
}

/** Client edit id (BoardEditRequest.edit_id: the server dedupes on it). */
export function newEditId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `edit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
