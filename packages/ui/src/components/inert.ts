import type { MouseEvent } from "react";

// "Inert" controls: drawn in Stitch but with no feature behind them yet (plan §6). They stay visible and
// focusable (so keyboard and screen-reader users find them too), announce aria-disabled="true", show an
// "Em breve" tooltip on hover and keyboard focus, and do nothing on click.

export const INERT_LABEL = "Em breve";

/** Muted look plus a CSS tooltip read from data-tooltip (no JS, no portal). */
export const inertClasses =
  "relative cursor-not-allowed opacity-60 " +
  "after:pointer-events-none after:absolute after:left-1/2 after:top-full after:z-20 after:mt-1.5 after:-translate-x-1/2 " +
  "after:whitespace-nowrap after:rounded-(--radius-pill) after:bg-(--ink) after:px-2.5 after:py-1 after:text-[11px] " +
  "after:font-bold after:leading-none after:text-white after:opacity-0 after:content-[attr(data-tooltip)] " +
  "after:transition-opacity after:duration-(--dur-fast) hover:after:opacity-100 focus-visible:after:opacity-100";

export function blockClick(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/** Spread on any element to make it inert: ARIA state, tooltip text and a click that does nothing. */
export function inertProps(label: string = INERT_LABEL) {
  return { "aria-disabled": true as const, "data-tooltip": label, onClick: blockClick };
}
