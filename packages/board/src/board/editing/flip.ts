// FLIP reflow for board edits: measure every block, let the store change the layout, then slide each block from
// where it was (240 ms ease-out). A block that just appeared (undo) fades in. Reduced motion: nothing animates.
export const REFLOW_MS = 240;
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

export interface Flip {
  /** Before a layout change: remember where each block is. */
  capture(): void;
  /** After the DOM changed (a column's layout effect): animate from the captured places. Runs once per capture. */
  play(): void;
}

export function createFlip(getWorld: () => HTMLElement | null, reduced: () => boolean): Flip {
  let first: Map<string, DOMRect> | null = null;
  let expire: ReturnType<typeof setTimeout> | undefined;
  const frames = (world: HTMLElement) =>
    world.querySelectorAll<HTMLElement>(":scope [data-column] > [data-element-id]");
  return {
    capture() {
      const world = getWorld();
      if (!world || reduced()) return;
      first = new Map();
      for (const f of frames(world))
        first.set(f.dataset.elementId as string, f.getBoundingClientRect());
      // A change that touched no column never plays: forget it.
      clearTimeout(expire);
      expire = setTimeout(() => (first = null), 200);
    },
    play() {
      const world = getWorld();
      const before = first;
      first = null;
      clearTimeout(expire);
      if (!world || !before || typeof world.animate !== "function") return;
      const scale =
        world.offsetWidth > 0 ? world.getBoundingClientRect().width / world.offsetWidth : 1;
      for (const f of frames(world)) {
        const was = before.get(f.dataset.elementId as string);
        if (!was) {
          f.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: EASE_OUT });
          continue;
        }
        const now = f.getBoundingClientRect();
        const dx = (was.left - now.left) / scale;
        const dy = (was.top - now.top) / scale;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        f.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
          { duration: REFLOW_MS, easing: EASE_OUT },
        );
      }
    },
  };
}
