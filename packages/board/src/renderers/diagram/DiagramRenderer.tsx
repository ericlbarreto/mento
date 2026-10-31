"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Annotation, HighlightColor } from "../../store";
import type { RendererProps } from "../types";
import { diagramAriaLabel, drawDiagram } from "./geometry";
import { isDiagramLive } from "./live";

/** Whole drawing time, whatever the shape count. */
const TOTAL_MS = 2500;
const MAX_SHAPE_MS = 450;

const marker: Record<HighlightColor, string> = {
  yellow: "var(--marker-yellow)",
  blue: "var(--marker-blue)",
  green: "#cdeccf",
  pink: "#fbd3e4",
};

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * `draw_diagram` element: an SVG built from typed data (never innerHTML), as wide as its column, in the
 * frame's viewBox. Played live, shapes are drawn one after the other (strokes by dash offset, labels fade in);
 * restored, replayed or with reduced motion it is static. Each shape is a `<g data-shape-id>` so
 * circle_annotate with shape_id can measure it (CircleLayer).
 */
export function DiagramRenderer({ element }: RendererProps<"diagram">) {
  const { title, view } = element.data;
  const drawn = useMemo(() => drawDiagram(element.id, element.data), [element.id, element.data]);
  const label = useMemo(() => diagramAriaLabel(element.data, drawn), [element.data, drawn]);
  const [animate] = useState(() => isDiagramLive(element.id) && !reducedMotion());
  const svgRef = useRef<SVGSVGElement>(null);
  const highlights = element.annotations.filter((a): a is Extract<Annotation, { kind: "highlight" }> => a.kind === "highlight" && !!a.shape_id);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!animate || !svg || typeof svg.animate !== "function") return;
    const per = Math.min(MAX_SHAPE_MS, TOTAL_MS / Math.max(1, drawn.length));
    const running: Animation[] = [];
    svg.querySelectorAll<SVGGElement>("g[data-shape-index]").forEach((g) => {
      const delay = Number(g.dataset.shapeIndex) * per;
      g.querySelectorAll<SVGPathElement>("path[data-stroke]").forEach((p) => {
        running.push(p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: per, delay, easing: "ease-in-out", fill: "backwards" }));
      });
      g.querySelectorAll<SVGElement>("[data-fade]").forEach((el) => {
        running.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(300, per), delay: delay + per * 0.6, fill: "backwards" }));
      });
    });
    return () => running.forEach((a) => a.cancel());
  }, [animate, drawn]);

  return (
    <figure className="w-full max-w-[640px]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${view.w} ${view.h}`}
        role="img"
        aria-label={label}
        className="mx-auto block h-auto overflow-visible"
        // Same scale for every frame: the wide frame (160 units) fills the column, square/tall ones are narrower.
        style={{ aspectRatio: `${view.w} / ${view.h}`, width: `${Math.min(100, (view.w / 160) * 100)}%` }}
      >
        {highlights.map((h) => {
          const box = drawn.find((d) => d.id === h.shape_id)?.box;
          return box ? (
            <rect
              key={h.action_id}
              x={box.x - 1.5}
              y={box.y - 1.5}
              width={box.w + 3}
              height={box.h + 3}
              rx={2}
              style={{ fill: marker[h.color], opacity: 0.85 }}
            />
          ) : null;
        })}
        {drawn.map((d, i) => (
          <g key={d.id} data-shape-id={d.id} data-shape-kind={d.kind} data-shape-index={i}>
            {d.fills.map((f, j) => (
              <path key={`f${j}`} d={f.d} data-fade="" style={{ fill: f.fill, stroke: "none" }} />
            ))}
            {d.strokes.map((s, j) => (
              s.dash ? (
                <path
                  key={`s${j}`}
                  d={s.d}
                  data-fade=""
                  strokeDasharray={s.dash}
                  style={{ fill: "none", stroke: s.stroke, strokeWidth: s.width, strokeLinecap: "round" }}
                />
              ) : (
                <path
                  key={`s${j}`}
                  d={s.d}
                  data-stroke=""
                  pathLength={animate ? 1 : undefined}
                  strokeDasharray={animate ? 1 : undefined}
                  style={{ fill: "none", stroke: s.stroke, strokeWidth: s.width, strokeLinecap: "round", strokeLinejoin: "round" }}
                />
              )
            ))}
            {d.dots.map((c, j) => (
              <circle key={`c${j}`} cx={c.x} cy={c.y} r={c.r} data-fade="" style={{ fill: c.color }} />
            ))}
            {d.texts.map((t, j) => (
              <text
                key={`t${j}`}
                x={t.x}
                y={t.y}
                data-fade=""
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fill: t.color, fontSize: t.size, fontFamily: "var(--font-board)", fontWeight: 600 }}
              >
                {t.text}
              </text>
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 text-center font-(family-name:--font-board) text-[22px] leading-tight text-(--ink-soft)">{title}</figcaption>
    </figure>
  );
}
