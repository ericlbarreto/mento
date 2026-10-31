// Board store: the reducer behind fine-grained subscriptions, so React components can subscribe to one
// element or one column (useSyncExternalStore) and adding an element never re-renders the others.
import type { Column } from "@mento/contracts";
import { type AnimationBus, createAnimationBus } from "./animation";
import { applyAction, applyEdit, applySvg, restoreRemoved } from "./reducer";
import {
  type BoardAction,
  type BoardEdit,
  type BoardState,
  COLUMNS,
  type ElementState,
  type LayoutChange,
  type RemovedElement,
  emptyBoard,
} from "./types";

type Listener = () => void;

export interface BoardStore {
  getState(): BoardState;
  getElement(id: string): ElementState | undefined;
  getColumn(column: Column): readonly string[];
  dispatch(action: BoardAction): void;
  /** Completes a streamed (svg_chunk) drawing. */
  applySvg(element_id: string, svg: string): void;
  /** A student delete or move (plan F). Applied instantly: nothing is re-written by the pen. */
  applyEdit(edit: BoardEdit): void;
  /** Undo of the last student delete. */
  restoreRemoved(removed: RemovedElement): void;
  /** Pinned element ids (plan G), in stacking order. */
  getFree(): readonly string[];
  /** Pins or attachments changed (plan G). */
  subscribeFree(listener: Listener): () => void;
  reset(): void;
  /**
   * Runs `fn` with animations off: what it dispatches appears at once (session restore). Listeners read
   * isInstant() during those commits.
   */
  instant(fn: () => void): void;
  isInstant(): boolean;
  /** Queue ↔ board handwriting channel (settle, pause, wait for the writing to finish). */
  readonly animation: AnimationBus;
  /** Any change. */
  subscribe(listener: Listener): () => void;
  subscribeElement(id: string, listener: Listener): () => void;
  subscribeColumn(column: Column, listener: Listener): () => void;
  /** Called with the id of every element newly inserted (used for auto-scroll). */
  subscribeAdded(listener: (id: string) => void): () => void;
  /**
   * A move, delete or undo is about to change the layout (live only, not during a restore): the board measures
   * the blocks here to animate the reflow.
   */
  subscribeLayout(listener: (change: LayoutChange) => void): () => void;
}

export interface BoardStoreOptions {
  initial?: BoardState;
  onWarning?: (message: string) => void;
}

export function createBoardStore(opts: BoardStoreOptions = {}): BoardStore {
  let state = opts.initial ?? emptyBoard();
  const all = new Set<Listener>();
  const byElement = new Map<string, Set<Listener>>();
  const byColumn = new Map<Column, Set<Listener>>();
  const added = new Set<(id: string) => void>();
  const layout = new Set<(change: LayoutChange) => void>();
  const free = new Set<Listener>();
  /** Announces a layout change unless it is part of a restore, and only when it will change something. */
  const beforeLayout = (change: LayoutChange, next: BoardState) => {
    if (instantDepth === 0 && next !== state) layout.forEach((l) => l(change));
  };
  const animation = createAnimationBus();
  let instantDepth = 0;

  const on = <K>(map: Map<K, Set<Listener>>, key: K, listener: Listener) => {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) map.delete(key);
    };
  };

  const commit = (next: BoardState) => {
    const prev = state;
    if (next === prev) return;
    state = next;
    for (const [id, listeners] of byElement) {
      if (prev.elements.get(id) !== next.elements.get(id)) listeners.forEach((l) => l());
    }
    for (const column of COLUMNS) {
      if (prev.columns[column] === next.columns[column]) continue;
      byColumn.get(column)?.forEach((l) => l());
    }
    if (prev.free !== next.free || prev.attached !== next.attached) free.forEach((l) => l());
    for (const id of next.elements.keys()) {
      if (!prev.elements.has(id)) added.forEach((l) => l(id));
    }
    all.forEach((l) => l());
  };

  return {
    getState: () => state,
    getElement: (id) => state.elements.get(id),
    getColumn: (column) => state.columns[column],
    dispatch(action) {
      const next = applyAction(state, action, { onWarning: opts.onWarning });
      if (action.name === "move_element") beforeLayout({ kind: "move", id: action.args.id, by: "tutor" }, next);
      else if (action.name === "place_element") beforeLayout({ kind: "place", id: action.args.id, by: "tutor" }, next);
      else if (action.name === "remove_element") beforeLayout({ kind: "remove", id: action.args.id, by: "tutor" }, next);
      commit(next);
    },
    applySvg: (element_id, svg) => commit(applySvg(state, element_id, svg, { onWarning: opts.onWarning })),
    applyEdit(edit) {
      const next = applyEdit(state, edit, { onWarning: opts.onWarning });
      beforeLayout({ kind: edit.op, id: edit.element_id, by: "student" }, next);
      instantDepth++;
      try {
        commit(next);
      } finally {
        instantDepth--;
      }
    },
    restoreRemoved(removed) {
      const next = restoreRemoved(state, removed);
      beforeLayout({ kind: "restore", id: removed.element.id, by: "student" }, next);
      instantDepth++;
      try {
        commit(next);
      } finally {
        instantDepth--;
      }
    },
    getFree: () => state.free,
    subscribeFree: (listener) => {
      free.add(listener);
      return () => free.delete(listener);
    },
    reset: () => commit(emptyBoard()),
    instant(fn) {
      instantDepth++;
      try {
        fn();
      } finally {
        instantDepth--;
      }
    },
    isInstant: () => instantDepth > 0,
    animation,
    subscribe: (listener) => {
      all.add(listener);
      return () => all.delete(listener);
    },
    subscribeElement: (id, listener) => on(byElement, id, listener),
    subscribeColumn: (column, listener) => on(byColumn, column, listener),
    subscribeAdded: (listener) => {
      added.add(listener);
      return () => added.delete(listener);
    },
    subscribeLayout: (listener) => {
      layout.add(listener);
      return () => layout.delete(listener);
    },
  };
}
