"use client";

import { type RefObject, useLayoutEffect, useState } from "react";
import type { HighlightColor } from "../store";
import { useBoardWriter } from "./context";
import { type Box, groupLines } from "./handwriting";

// Marker hues from docs/frontend-rendering-guide.md §4.5; multiplied over the paper so the ink stays on top.
const marker: Record<HighlightColor, string> = {
  yellow: "#fde68a",
  green: "#bbf7d0",
  pink: "#fbcfe8",
  blue: "#bfdbfe",
};
/** Ragged marker ends (~2px). */
const ragged =
  "polygon(2px 6%, calc(100% - 1px) 0, 100% 38%, calc(100% - 2px) 72%, calc(100% - 0.5px) 100%, 1px 94%, 0 58%, 1.5px 26%)";

/** Line boxes of the element's text, in the frame's (untransformed) coordinates. Falls back to the whole content. */
function measureLines(content: HTMLElement, frame: HTMLElement): Box[] {
  const f = frame.getBoundingClientRect();
  const scale = frame.offsetWidth > 0 ? f.width / frame.offsetWidth : 1;
  const local = (r: DOMRect): Box => ({
    top: (r.top - f.top) / scale,
    bottom: (r.bottom - f.top) / scale,
    left: (r.left - f.left) / scale,
    right: (r.right - f.left) / scale,
  });
  const target = content.querySelector<HTMLElement>("[data-board-write]") ?? content;
  const walker = target.ownerDocument.createTreeWalker(target, 4 /* NodeFilter.SHOW_TEXT */);
  const range = target.ownerDocument.createRange();
  const rects: Box[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim()) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 0) rects.push(local(r));
  }
  if (rects.length === 0) return [local(content.getBoundingClientRect())];
  return groupLines(rects).lines;
}

/**
 * `highlight` as a marker swept line by line under the ink (lower 60% of each line). The board's pen animates the
 * sweep; it renders swept already when restored, at mount or with reduced motion.
 */
export function HighlightLayer({
  contentRef,
  action_id,
  color,
  version,
}: {
  contentRef: RefObject<HTMLElement | null>;
  action_id: string;
  color: HighlightColor;
  version: unknown;
}) {
  const writer = useBoardWriter();
  const [lines, setLines] = useState<Box[]>([]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    const frame = content?.offsetParent as HTMLElement | null | undefined;
    if (!content || !frame) return;
    const measure = () => setLines(measureLines(content, frame));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [contentRef, version]);

  const pending = writer?.isMarkPending(action_id) ?? false;
  return (
    <div
      aria-hidden
      data-mark-for={action_id}
      className="pointer-events-none absolute inset-0 mix-blend-multiply"
    >
      {lines.map((l, i) => {
        const h = l.bottom - l.top;
        return (
          <span
            key={i}
            data-mark-line={i}
            className="absolute block origin-left opacity-80"
            style={{
              left: l.left - 3,
              top: l.top + h * 0.4,
              width: l.right - l.left + 6,
              height: h * 0.6,
              background: marker[color],
              clipPath: ragged,
              borderRadius: "3px 6px 4px 7px",
              transform: `skewY(-1deg) scaleX(${pending ? 0 : 1})`,
            }}
          />
        );
      })}
    </div>
  );
}
