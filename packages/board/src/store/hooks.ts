"use client";

// React bindings for the board store: one subscription per element / per column.
import { useCallback, useSyncExternalStore } from "react";
import type { Column } from "@mento/contracts";
import type { BoardStore } from "./store";
import type { ElementState } from "./types";

export function useBoardElement(store: BoardStore, id: string): ElementState | undefined {
  const subscribe = useCallback((l: () => void) => store.subscribeElement(id, l), [store, id]);
  const get = () => store.getElement(id);
  return useSyncExternalStore(subscribe, get, get);
}

export function useBoardColumn(store: BoardStore, column: Column): readonly string[] {
  const subscribe = useCallback((l: () => void) => store.subscribeColumn(column, l), [store, column]);
  const get = () => store.getColumn(column);
  return useSyncExternalStore(subscribe, get, get);
}

/** Pinned element ids (plan G). */
export function useBoardFree(store: BoardStore): readonly string[] {
  const subscribe = useCallback((l: () => void) => store.subscribeFree(l), [store]);
  const get = () => store.getFree();
  return useSyncExternalStore(subscribe, get, get);
}
