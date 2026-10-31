"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { CanvasControls } from "../useCanvasCamera";
import type { Flip } from "./flip";
import type { EditPermissions } from "./model";
import type { EditOutbox } from "./outbox";

/** What the host gives the board to let the student edit it (absent = read-only board). */
export interface BoardEditingEnv {
  /** Where the edits go (createEditOutbox with the API call). */
  outbox: EditOutbox;
  /** Blocks from the turn still playing: no toolbar until the tutor is done. */
  lockedIds: ReadonlySet<string>;
  /** The student selected a block (click, tap, Enter) or cleared the selection (null). */
  onSelect?(id: string | null): void;
  /** The student deleted a block (the host clears its "Sobre: …" chip if it pointed there). */
  onRemoved?(id: string): void;
}

export interface Selection {
  get(): string | null;
  set(id: string | null): void;
  subscribe(listener: () => void): () => void;
}

export function createSelection(): Selection {
  let id: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => id,
    set(next) {
      if (next === id) return;
      id = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The board's editing driver, read by each block and its toolbar. */
export interface BoardEditor {
  selection: Selection;
  camera: Pick<CanvasControls, "subscribe">;
  flip: Flip;
  /** Render-time rules (the writing state is left to CSS: the toolbar hides while the pen writes). */
  permissions(id: string): EditPermissions | null;
  remove(id: string, opts?: { focusNext?: boolean }): void;
  undo(): void;
  startDrag(e: PointerEvent, id: string, handle: HTMLElement): void;
  enterMoveMode(id: string): void;
}

/** What the toolbar's rules depend on; a change re-renders the selected block's toolbar only. */
export interface BoardEditState {
  lockedIds: ReadonlySet<string>;
  openQuestionId: string | null;
}
const BoardEditStateContext = createContext<BoardEditState | null>(null);
export const BoardEditStateProvider = BoardEditStateContext.Provider;
export const useBoardEditState = () => useContext(BoardEditStateContext);

const BoardEditorContext = createContext<BoardEditor | null>(null);
export const BoardEditorProvider = BoardEditorContext.Provider;
export const useBoardEditor = () => useContext(BoardEditorContext);

/** True while `id` is the selected block (only the blocks whose answer changes re-render). */
export function useIsSelected(editor: BoardEditor | null, id: string): boolean {
  const subscribe = useCallback(
    (l: () => void) => editor?.selection.subscribe(l) ?? (() => undefined),
    [editor],
  );
  const get = () => editor?.selection.get() === id;
  return useSyncExternalStore(subscribe, get, () => false);
}
