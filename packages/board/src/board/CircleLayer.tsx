"use client";

import { type RefObject, useLayoutEffect, useState } from "react";
import type { Annotation, CircleColor } from "../store";
import { useBoardWriter } from "./context";
import { findTextRange } from "./textMatch";

type Circle = Extract<Annotation, { kind: "circle" }>;

interface Box {
  action_id: string;
  color: CircleColor;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Same hues as docs/frontend-rendering-guide.md §4.5 (blue is --mento-blue).
const stroke: Record<CircleColor, string> = { red: "#dc2626", blue: "var(--mento-blue)", green: "#16a34a" };

const PAD_X = 10;
const PAD_Y = 6;

/** Small deterministic wobble per circle, so two circles never look stamped. */
function seed(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (Math.abs(h) % 1000) / 1000;
}

/** A hand-drawn loop around the box: a slightly irregular ellipse that overshoots its start. */
export function circlePath(b: { x: number; y: number; w: number; h: number }, s: number): string {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const rx = b.w / 2 + PAD_X;
  const ry = b.h / 2 + PAD_Y;
  const start = -Math.PI * (0.55 + 0.2 * s);
  const sweep = Math.PI * 2.12;
  const steps = 48;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + sweep * t;
    // Radius drifts outward along the stroke so the overshoot does not land on the start.
    const k = 1 + 0.06 * t + 0.03 * Math.sin(a * 3 + s * 6);
    pts.push(`${(cx + rx * k * Math.cos(a)).toFixed(1)} ${(cy + ry * k * Math.sin(a)).toFixed(1)}`);
  }
  return `M ${pts.join(" L ")}`;
}

/**
 * Circles for `circle_annotate`, drawn over the element's content. Boxes are measured in the element's own
 * (untransformed) coordinates, so the canvas pan/zoom moves them with the element and never re-measures.
 */
export function CircleLayer({
  contentRef,
  circles,
  version,
}: {
  contentRef: RefObject<HTMLElement | null>;
  circles: readonly Circle[];
  /** Changes when the element's content changes (re-measure). */
  version: unknown;
}) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const writer = useBoardWriter();

  useLayoutEffect(() => {
    const content = contentRef.current;
    const frame = content?.offsetParent as HTMLElement | null | undefined;
    if (!content || !frame || circles.length === 0) {
      setBoxes([]);
      return;
    }
    const measure = () => {
      const f = frame.getBoundingClientRect();
      // Rendered size over layout size = the canvas zoom applied to every ancestor transform.
      const scale = frame.offsetWidth > 0 ? f.width / frame.offsetWidth : 1;
      const next: Box[] = [];
      for (const c of circles) {
        const target = c.shape_id ? content.querySelector(`[data-shape-id="${c.shape_id}"]`) : findTextRange(content, c.text_to_match);
        const r = target?.getBoundingClientRect();
        if (!r || r.width === 0) continue;
        next.push({
          action_id: c.action_id,
          color: c.color,
          x: (r.left - f.left) / scale,
          y: (r.top - f.top) / scale,
          w: r.width / scale,
          h: r.height / scale,
        });
      }
      setBoxes(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [contentRef, circles, version]);

  return boxes.length === 0 ? null : (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
      {boxes.map((b) => (
        <CirclePath key={b.action_id} box={b} pending={writer?.isMarkPending(b.action_id) ?? false} />
      ))}
    </svg>
  );
}

/** The board's pen draws a pending circle (stroke-dashoffset 1 → 0, see writer.ts); otherwise it renders drawn. */
function CirclePath({ box, pending }: { box: Box; pending: boolean }) {
  return (
    <path
      data-circle-for={box.action_id}
      d={circlePath(box, seed(box.action_id))}
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={pending ? 1 : 0}
      fill="none"
      stroke={stroke[box.color]}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}
