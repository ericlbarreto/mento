// Turns a resolved diagram (DiagramBody, absolute grid units) into hand-drawn SVG path data with roughjs.
// Pure and deterministic: every shape is seeded by hash(element id + shape id), so a reload or another client
// draws exactly the same wobble. No DOM: the renderer turns the result into React elements.
import rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import { DIAGRAM_FONT_SIZE, type DiagramBody, type DiagramColor, type DiagramLabel, type DiagramShape } from "@mento/contracts";

export const INK: Record<DiagramColor, string> = { ink: "var(--ink)", red: "#dc2626", blue: "var(--mento-blue)", green: "#16a34a" };
export const SOFT: Record<DiagramColor, string> = { ink: "var(--paper-2)", red: "#fde4e4", blue: "var(--marker-blue)", green: "#dcf2de" };

export interface StrokePath {
  d: string;
  stroke: string;
  width: number;
  /** SVG dash pattern (dashed lines fade in instead of being drawn by dash offset). */
  dash?: string;
}
export interface FillPath {
  d: string;
  fill: string;
}
export interface DrawnText {
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
}
export interface DrawnShape {
  id: string;
  kind: DiagramShape["kind"];
  fills: FillPath[];
  strokes: StrokePath[];
  dots: { x: number; y: number; r: number; color: string }[];
  texts: DrawnText[];
  /** Axis-aligned box of the geometry and labels (shape highlight). */
  box: { x: number; y: number; w: number; h: number };
}

const generator = rough.generator();

export function seedOf(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 2147483646 || 1;
}

type P = [number, number];
const STROKE = 0.75;

const paths = (drawable: ReturnType<typeof generator.line>): { strokes: StrokePath[]; fills: FillPath[] } => {
  const strokes: StrokePath[] = [];
  const fills: FillPath[] = [];
  for (const p of generator.toPaths(drawable)) {
    if (p.fill && p.fill !== "none") fills.push({ d: p.d, fill: p.fill });
    if (p.stroke && p.stroke !== "none") strokes.push({ d: p.d, stroke: p.stroke, width: p.strokeWidth });
  }
  return { strokes, fills };
};

const rotate = (x: number, y: number, deg: number): P => {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) + y * Math.sin(r), -x * Math.sin(r) + y * Math.cos(r)];
};

/** Arrow head: a two-stroke chevron at the tip. */
function head(x1: number, y1: number, x2: number, y2: number): P[] {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const size = Math.min(4, Math.max(2, len * 0.3));
  const ux = (x1 - x2) / len;
  const uy = (y1 - y2) / len;
  const wing = (deg: number): P => {
    const [rx, ry] = rotate(ux, uy, deg);
    return [x2 + rx * size, y2 + ry * size];
  };
  return [wing(26), [x2, y2], wing(-26)];
}

const text = (l: DiagramLabel, color: string): DrawnText => ({ text: l.text, x: l.x, y: l.y, size: DIAGRAM_FONT_SIZE[l.size], color });
const labelBox = (t: DrawnText): P[] => {
  const w = Math.max(t.size * 0.8, [...t.text].length * t.size * 0.5);
  return [
    [t.x - w / 2, t.y - t.size * 0.55],
    [t.x + w / 2, t.y + t.size * 0.55],
  ];
};

export function drawShape(elementId: string, s: DiagramShape): DrawnShape {
  const o = (extra: Options = {}): Options => ({
    seed: seedOf(`${elementId}:${s.id}`),
    roughness: 0.8,
    bowing: 0.6,
    maxRandomnessOffset: 0.9,
    strokeWidth: STROKE,
    ...extra,
  });
  const out: DrawnShape = { id: s.id, kind: s.kind, fills: [], strokes: [], dots: [], texts: [], box: { x: 0, y: 0, w: 0, h: 0 } };
  const pts: P[] = [];
  const push = (r: { strokes: StrokePath[]; fills: FillPath[] }) => {
    out.strokes.push(...r.strokes);
    out.fills.push(...r.fills);
  };

  switch (s.kind) {
    case "rect": {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as P[]).map(([a, b]) => {
        const [rx, ry] = rotate((a * s.w) / 2, (b * s.h) / 2, s.angle);
        return [cx + rx, cy + ry] as P;
      });
      const fill = s.fill === "soft" ? { fill: SOFT[s.color], fillStyle: "solid" } : {};
      push(paths(generator.polygon(corners, o({ stroke: INK[s.color], ...fill }))));
      pts.push(...corners);
      if (s.label) out.texts.push(text(s.label, INK.ink));
      break;
    }
    case "line": {
      const line = paths(generator.line(s.x1, s.y1, s.x2, s.y2, o({ stroke: INK[s.color], disableMultiStroke: s.dashed })));
      // roughjs keeps the dash as a render option, not in the path data: carry it to the SVG.
      if (s.dashed) for (const p of line.strokes) p.dash = "2.2 1.8";
      push(line);
      pts.push([s.x1, s.y1], [s.x2, s.y2]);
      if (s.ground) {
        const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        const n = Math.max(2, Math.floor(len / 6));
        for (let i = 0; i <= n; i++) {
          const x = s.x1 + ((s.x2 - s.x1) * i) / n;
          const y = s.y1 + ((s.y2 - s.y1) * i) / n;
          push(paths(generator.line(x, y + 0.4, x - 2.6, y + 3, o({ stroke: INK[s.color], strokeWidth: 0.45, roughness: 0.4, seed: seedOf(`${elementId}:${s.id}:${i}`) }))));
        }
        pts.push([s.x1 - 2.6, s.y1 + 3], [s.x2, s.y2 + 3]);
      }
      if (s.label) out.texts.push(text(s.label, INK[s.color]));
      break;
    }
    case "arrow": {
      const stroke = INK[s.color];
      push(paths(generator.line(s.x1, s.y1, s.x2, s.y2, o({ stroke, strokeWidth: 0.9 }))));
      push(paths(generator.linearPath(head(s.x1, s.y1, s.x2, s.y2), o({ stroke, strokeWidth: 0.9, roughness: 0.5 }))));
      pts.push([s.x1, s.y1], [s.x2, s.y2]);
      if (s.label) out.texts.push(text(s.label, stroke));
      break;
    }
    case "text":
      out.texts.push({ text: s.text, x: s.x, y: s.y, size: DIAGRAM_FONT_SIZE[s.size], color: INK[s.color] });
      break;
    case "axes": {
      const o2 = (extra: Options = {}) => o({ stroke: INK.ink, strokeWidth: 0.55, roughness: 0.5, ...extra });
      const { x_axis: xa, y_axis: ya } = s;
      push(paths(generator.line(xa.x1, xa.y1, xa.x2 + 3, xa.y2, o2())));
      push(paths(generator.linearPath(head(xa.x1, xa.y1, xa.x2 + 3, xa.y2), o2())));
      push(paths(generator.line(ya.x1, ya.y1, ya.x2, ya.y2 - 3, o2({ seed: seedOf(`${elementId}:${s.id}:y`) }))));
      push(paths(generator.linearPath(head(ya.x1, ya.y1, ya.x2, ya.y2 - 3), o2({ seed: seedOf(`${elementId}:${s.id}:yh`) }))));
      // Ticks are short and plain: rough wobble on a 1.6-unit mark only adds noise.
      for (const t of s.ticks) {
        const d = t.axis === "x" ? `M${t.x} ${t.y - 0.9}L${t.x} ${t.y + 0.9}` : `M${t.x - 0.9} ${t.y}L${t.x + 0.9} ${t.y}`;
        out.strokes.push({ d, stroke: INK.ink, width: 0.45 });
        out.texts.push(text(t.label, "var(--ink-soft)"));
      }
      if (s.x_label) out.texts.push(text(s.x_label, INK.ink));
      if (s.y_label) out.texts.push(text(s.y_label, INK.ink));
      pts.push([xa.x1, xa.y1], [xa.x2 + 3, xa.y2], [ya.x1, ya.y1], [ya.x2, ya.y2 - 3]);
      break;
    }
    case "polyline": {
      const points = s.points.map((p) => [p[0], p[1]] as P);
      const stroke = INK[s.color];
      const fill = s.fill === "soft" ? { fill: SOFT[s.color], fillStyle: "solid" } : {};
      const drawable = s.closed
        ? generator.polygon(points, o({ stroke, ...fill }))
        : s.smooth
          ? generator.curve(points, o({ stroke, strokeWidth: 0.9, roughness: 0.5, disableMultiStroke: true }))
          : generator.linearPath(points, o({ stroke, strokeWidth: 0.9 }));
      push(paths(drawable));
      pts.push(...points);
      if (s.label) out.texts.push(text(s.label, stroke));
      break;
    }
    case "point":
      out.dots.push({ x: s.x, y: s.y, r: 1.3, color: INK[s.color] });
      pts.push([s.x - 1.3, s.y - 1.3], [s.x + 1.3, s.y + 1.3]);
      if (s.label) out.texts.push(text(s.label, INK[s.color]));
      break;
  }

  for (const t of out.texts) pts.push(...labelBox(t));
  if (pts.length) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    out.box = { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return out;
}

export function drawDiagram(elementId: string, body: Pick<DiagramBody, "shapes">): DrawnShape[] {
  return body.shapes.map((s) => drawShape(elementId, s));
}

/** Accessible name: the title, then every label in shape order. */
export function diagramAriaLabel(body: Pick<DiagramBody, "title" | "shapes">, drawn: DrawnShape[]): string {
  const labels = drawn.flatMap((d) => (d.kind === "axes" ? [] : d.texts.map((t) => t.text)));
  return labels.length ? `${body.title}: ${labels.join(", ")}` : body.title;
}
