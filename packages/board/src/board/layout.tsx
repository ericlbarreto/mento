"use client";

// Plan G layout: blocks pinned at a free spot (the student's drag), blocks attached beside another one (the
// tutor's place_element), and the pass that keeps the column flow from running under a pinned block.
import { type RefObject, useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { RendererMap } from "../renderers";
import { type BoardStore, type PlaceSide, attachedTo, useBoardElement, useBoardFree } from "../store";
import { BLOCK_GAP_PX } from "./columns";
import { ElementFrame } from "./ElementFrame";

/** Room kept around pinned blocks at the world's right and bottom edges (the camera can reach them). */
const WORLD_EDGE_PX = 64;

/** The blocks attached to `host`, by side; stable between renders while the attachments do not change. */
function useAttached(store: BoardStore, host: string): Record<PlaceSide, string[]> | null {
  const subscribe = useCallback((l: () => void) => store.subscribeFree(l), [store]);
  const key = useSyncExternalStore(
    subscribe,
    () => {
      const state = store.getState();
      return attachedTo(state, host)
        .map((id) => `${state.elements.get(id)?.near?.side}:${id}`)
        .join(",");
    },
    () => "",
  );
  return useMemo(() => {
    if (!key) return null;
    const sides: Record<PlaceSide, string[]> = { left: [], right: [], above: [], below: [] };
    for (const part of key.split(",")) {
      const [side, id] = part.split(":") as [PlaceSide, string];
      sides[side].push(id);
    }
    return sides;
  }, [key]);
}

/** A block with the blocks attached to it: above, then left · block · right in a row, then below. */
export function BlockGroup({ store, id, renderers }: { store: BoardStore; id: string; renderers: RendererMap }) {
  const sides = useAttached(store, id);
  const frame = (x: string) => <ElementFrame key={x} store={store} id={x} renderers={renderers} />;
  if (!sides) return frame(id);
  return (
    <div data-block-group={id} className="flex w-max flex-col gap-5">
      {sides.above.map(frame)}
      <div className="flex items-start" style={{ gap: BLOCK_GAP_PX }}>
        {sides.left.map(frame)}
        {frame(id)}
        {sides.right.map(frame)}
      </div>
      {sides.below.map(frame)}
    </div>
  );
}

/** The student's pinned blocks, drawn at their spot in the world (px at zoom 1 from its top-left). */
export function PinnedLayer({ store, renderers }: { store: BoardStore; renderers: RendererMap }) {
  const ids = useBoardFree(store);
  return ids.map((id) => <PinnedBlock key={id} store={store} id={id} renderers={renderers} />);
}

function PinnedBlock({ store, id, renderers }: { store: BoardStore; id: string; renderers: RendererMap }) {
  const pos = useBoardElement(store, id)?.pos;
  if (!pos) return null;
  return (
    <div data-pinned={id} className="absolute" style={{ left: pos.x, top: pos.y }}>
      <BlockGroup store={store} id={id} renderers={renderers} />
    </div>
  );
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const boxOf = (el: HTMLElement): Box => ({
  left: el.offsetLeft,
  top: el.offsetTop,
  right: el.offsetLeft + el.offsetWidth,
  bottom: el.offsetTop + el.offsetHeight,
});

/** World boxes of the pinned blocks (offsetParent = the world), the one being skipped excluded. */
export function pinnedBoxes(world: HTMLElement, skip?: string): Box[] {
  return [...world.querySelectorAll<HTMLElement>(":scope > [data-pinned]")]
    .filter((p) => p.dataset.pinned !== skip)
    .map(boxOf);
}

/** First top at or below `top` where a box of `height` in [left, right] clears every box (with the gap). */
export function clearTop(top: number, left: number, right: number, height: number, boxes: readonly Box[]): number {
  let y = top;
  for (let moved = true, guard = 0; moved && guard < 50; guard++) {
    moved = false;
    for (const b of boxes) {
      const overlapX = left < b.right && right > b.left;
      const overlapY = y < b.bottom + BLOCK_GAP_PX / 2 && y + height > b.top - BLOCK_GAP_PX / 2;
      if (overlapX && overlapY) {
        y = b.bottom + BLOCK_GAP_PX / 2;
        moved = true;
      }
    }
  }
  return y;
}

/**
 * Keeps the column flow clear of pinned blocks (a flow block that would run under one is pushed below it) and
 * grows the world to include every pinned block (the camera's bounds). Runs once per frame after any change.
 */
export function usePinnedLayout(worldRef: RefObject<HTMLDivElement | null>, store: BoardStore) {
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    // A timer, not rAF: a hidden tab must still lay out what it restores.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      timer = undefined;
      const pins = pinnedBoxes(world);
      for (const section of world.querySelectorAll<HTMLElement>(":scope > [data-column]")) {
        for (const child of section.children as Iterable<HTMLElement>) {
          child.style.marginTop = "";
          const natural = child.offsetTop;
          const left = section.offsetLeft;
          const top = pins.length ? clearTop(natural, left, left + child.offsetWidth, child.offsetHeight, pins) : natural;
          child.style.marginTop = top > natural ? `${Math.round(top - natural)}px` : "";
        }
      }
      const right = Math.max(0, ...pins.map((b) => b.right + WORLD_EDGE_PX));
      const bottom = Math.max(0, ...pins.map((b) => b.bottom + WORLD_EDGE_PX));
      const minWidth = right ? `${right}px` : "";
      const minHeight = bottom ? `${bottom}px` : "";
      if (world.style.minWidth !== minWidth) world.style.minWidth = minWidth;
      if (world.style.minHeight !== minHeight) world.style.minHeight = minHeight;
    };
    const schedule = () => {
      timer ??= setTimeout(run, 16);
    };
    // Blocks grow while written and when a picture lands: watch every block and the pinned wrappers.
    const sizes = new ResizeObserver(schedule);
    const observeAll = () => {
      sizes.disconnect();
      sizes.observe(world);
      world.querySelectorAll("[data-board-block], [data-pinned]").forEach((el) => sizes.observe(el));
    };
    observeAll();
    const unsubscribe = store.subscribe(() => {
      schedule();
      setTimeout(observeAll, 16);
    });
    schedule();
    return () => {
      clearTimeout(timer);
      sizes.disconnect();
      unsubscribe();
    };
  }, [worldRef, store]);
}
