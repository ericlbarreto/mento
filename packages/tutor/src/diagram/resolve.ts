// Pure resolver for `draw_diagram` (D75): the model's primitives (anchors, magnitudes, data units) in, absolute
// geometry inside the frame out. Never throws: an invalid shape is dropped with a reason, and a diagram with no
// shape left resolves to null (the action is then dropped like any other invalid tool call).
import { z } from "zod";
import {
  Column,
  DIAGRAM_FONT_SIZE,
  DIAGRAM_FRAME_SIZE,
  DiagramFrame,
  DiagramShapeBase,
  ElementId,
  MAX_DIAGRAM_SHAPES,
  type DiagramArgs,
  type DiagramColor,
  type DiagramLabel,
  type DiagramShape,
  type DiagramTextSize,
} from "@mento/contracts";

export interface ResolvedDiagram {
  args: DiagramArgs | null;
  /** One line per shape that was dropped or changed, e.g. `arrow f: unknown ref "caixa"`. */
  notes: string[];
  /** Why `args` is null. */
  reason?: string;
}

type V = { x: number; y: number };
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Arrow lengths, in grid units (the short side of every frame is 100). */
const LENGTH = { s: 12, m: 20, l: 30 } as const;
const MAX_FORCE_LEN = 34;
const MIN_FORCE_LEN = 10;
/** Plot area margins around `axes` (left room for y ticks, bottom room for x ticks). */
const PLOT_MARGIN = { left: 14, right: 8, top: 8, bottom: 12 };
const FIT_MARGIN = 3;
const LABEL_GAP = 1.5;
/** Caveat is narrow; this over-estimates a little so labels keep clear of boxes. */
const CHAR_WIDTH = 0.5;

const Envelope = z.object({
  id: ElementId,
  column: Column,
  title: z.string().optional(),
  frame: DiagramFrame.optional().catch(undefined),
  shapes: z.array(z.unknown()),
});

const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
const len = (a: V): number => Math.hypot(a.x, a.y);
const unit = (a: V): V => {
  const l = len(a);
  return l > 0 ? mul(a, 1 / l) : { x: 0, y: 0 };
};
/** Rotate counter-clockwise on screen (y grows down). */
const rot = (a: V, deg: number): V => {
  const r = (deg * Math.PI) / 180;
  return { x: a.x * Math.cos(r) + a.y * Math.sin(r), y: -a.x * Math.sin(r) + a.y * Math.cos(r) };
};
const fromDeg = (deg: number): V => rot({ x: 1, y: 0 }, deg);
const round = (n: number) => Math.round(n * 10) / 10 || 0; // never -0

export function labelSize(text: string, size: DiagramTextSize): { w: number; h: number } {
  const fs = DIAGRAM_FONT_SIZE[size];
  return { w: Math.max(fs * 0.8, [...text].length * fs * CHAR_WIDTH), h: fs * 1.1 };
}
const labelBox = (l: DiagramLabel): Box => {
  const { w, h } = labelSize(l.text, l.size);
  return { x0: l.x - w / 2, y0: l.y - h / 2, x1: l.x + w / 2, y1: l.y + h / 2 };
};
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const inside = (a: Box, b: Box) => a.x0 >= b.x0 && a.y0 >= b.y0 && a.x1 <= b.x1 && a.y1 <= b.y1;
const grow = (b: Box, k: number): Box => ({ x0: b.x0 - k, y0: b.y0 - k, x1: b.x1 + k, y1: b.y1 + k });

/** Liang–Barsky: the part of segment p→q inside `b`, as parameters [t0, t1], or null. */
function clipSegment(p: V, q: V, b: Box): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const d = sub(q, p);
  const checks: [number, number][] = [
    [-d.x, p.x - b.x0],
    [d.x, b.x1 - p.x],
    [-d.y, p.y - b.y0],
    [d.y, b.y1 - p.y],
  ];
  for (const [pk, qk] of checks) {
    if (pk === 0) {
      if (qk < 0) return null;
      continue;
    }
    const t = qk / pk;
    if (pk < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

/** Keeps the longest run of a polyline that stays inside `b` (a curve leaving the plot area is cut). */
function clipPolyline(pts: V[], b: Box): V[] {
  const runs: V[][] = [];
  let run: V[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i] as V;
    const q = pts[i + 1] as V;
    const c = clipSegment(p, q, b);
    if (!c) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    const a = add(p, mul(sub(q, p), c[0]));
    const e = add(p, mul(sub(q, p), c[1]));
    if (!run.length || c[0] > 0) {
      if (run.length) runs.push(run);
      run = [a];
    }
    run.push(e);
    if (c[1] < 1) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  const arc = (r: V[]) => r.reduce((s, p, i) => (i ? s + len(sub(p, r[i - 1] as V)) : 0), 0);
  return runs.filter((r) => r.length >= 2).sort((a, b) => arc(b) - arc(a))[0] ?? [];
}

/** Internal geometry used by refs and by fit-to-frame (rects by center). */
type Geo =
  | { kind: "rect"; c: V; w: number; h: number; angle: number; fill: "none" | "soft"; color: DiagramColor }
  | { kind: "line"; p: V; q: V; dashed: boolean; ground: boolean; color: DiagramColor }
  | { kind: "arrow"; p: V; q: V; color: DiagramColor }
  | { kind: "text"; p: V; text: string; size: DiagramTextSize; color: DiagramColor }
  | { kind: "axes"; x: [V, V]; y: [V, V]; ticks: { axis: "x" | "y"; p: V; label: DiagramLabel }[]; x_label?: DiagramLabel; y_label?: DiagramLabel }
  | { kind: "polyline"; pts: V[]; closed: boolean; smooth: boolean; fill: "none" | "soft"; color: DiagramColor }
  | { kind: "point"; p: V; color: DiagramColor };

interface Item {
  id: string;
  geo: Geo;
  label?: DiagramLabel;
}

interface PendingLabel {
  item: Item;
  text: string;
  anchor: V;
  /** Preferred direction from the anchor. */
  dir: V;
}

const rectCorners = (g: Extract<Geo, { kind: "rect" }>): V[] =>
  [
    { x: -g.w / 2, y: -g.h / 2 },
    { x: g.w / 2, y: -g.h / 2 },
    { x: g.w / 2, y: g.h / 2 },
    { x: -g.w / 2, y: g.h / 2 },
  ].map((v) => add(g.c, rot(v, g.angle)));

const boxOf = (pts: V[]): Box => ({
  x0: Math.min(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)),
  x1: Math.max(...pts.map((p) => p.x)),
  y1: Math.max(...pts.map((p) => p.y)),
});

/** Segments a label should keep clear of. */
function segmentsOf(g: Geo): [V, V][] {
  switch (g.kind) {
    case "line":
    case "arrow":
      return [[g.p, g.q]];
    case "axes":
      return [g.x, g.y];
    case "polyline":
      return g.pts.slice(1).map((q, i) => [g.pts[i] as V, q]);
    default:
      return [];
  }
}

/** Every point of the shape's own geometry (no labels), for the bounding box. */
function pointsOf(g: Geo): V[] {
  switch (g.kind) {
    case "rect":
      return rectCorners(g);
    case "line":
      return g.ground ? [g.p, g.q, add(g.p, { x: 0, y: 3 }), add(g.q, { x: 0, y: 3 })] : [g.p, g.q];
    case "arrow":
      return [g.p, g.q];
    case "text": {
      const { w, h } = labelSize(g.text, g.size);
      return [add(g.p, { x: -w / 2, y: -h / 2 }), add(g.p, { x: w / 2, y: h / 2 })];
    }
    case "axes":
      return [...g.x, ...g.y];
    case "polyline":
      return g.pts;
    case "point":
      return [add(g.p, { x: -1.5, y: -1.5 }), add(g.p, { x: 1.5, y: 1.5 })];
  }
}

const fmtTick = (n: number) => String(round(n)).replace(".", ",").replace("-", "−");

export function resolveDiagram(input: unknown): ResolvedDiagram {
  const env = Envelope.safeParse(input);
  if (!env.success) {
    const issue = env.error.issues[0];
    return { args: null, notes: [], reason: `invalid draw_diagram: ${issue?.path.join(".") ?? ""} ${issue?.message ?? ""}`.trim() };
  }
  const notes: string[] = [];
  const frame = env.data.frame ?? "wide";
  const view = DIAGRAM_FRAME_SIZE[frame];
  const viewBox: Box = { x0: 0, y0: 0, x1: view.w, y1: view.h };
  const title = (env.data.title?.trim() || "Diagrama").slice(0, 80);

  // 1. Parse each shape on its own: one bad shape never sinks the diagram.
  if (env.data.shapes.length > MAX_DIAGRAM_SHAPES) notes.push(`${env.data.shapes.length - MAX_DIAGRAM_SHAPES} shapes over the limit of ${MAX_DIAGRAM_SHAPES} dropped`);
  const base: DiagramShapeBase[] = [];
  const seen = new Set<string>();
  env.data.shapes.slice(0, MAX_DIAGRAM_SHAPES).forEach((raw, i) => {
    const p = DiagramShapeBase.safeParse(raw);
    if (!p.success) {
      const issue = p.error.issues[0];
      const id = typeof (raw as { id?: unknown })?.id === "string" ? (raw as { id: string }).id : `#${i}`;
      return void notes.push(`shape ${id}: ${issue?.path.join(".") ?? ""} ${issue?.message ?? "invalid"}`.trim());
    }
    if (seen.has(p.data.id)) return void notes.push(`shape ${p.data.id}: duplicate id`);
    seen.add(p.data.id);
    base.push(p.data);
  });

  // 2. Coordinates: data units when the diagram has a valid axes (the first one), grid units otherwise.
  let axes: Extract<DiagramShapeBase, { kind: "axes" }> | undefined;
  for (const s of base) {
    if (s.kind !== "axes") continue;
    const [x0, x1] = s.x_range as [number, number];
    const [y0, y1] = s.y_range as [number, number];
    if (axes) notes.push(`axes ${s.id}: only one axes per diagram`);
    else if (!(x1 > x0 && y1 > y0)) notes.push(`axes ${s.id}: ranges must be [min, max] with max > min`);
    else axes = s;
  }
  const plot: Box = { x0: PLOT_MARGIN.left, y0: PLOT_MARGIN.top, x1: view.w - PLOT_MARGIN.right, y1: view.h - PLOT_MARGIN.bottom };
  const [dx0, dx1] = (axes?.x_range ?? [0, 1]) as [number, number];
  const [dy0, dy1] = (axes?.y_range ?? [0, 1]) as [number, number];
  const sx = (plot.x1 - plot.x0) / (dx1 - dx0);
  const sy = (plot.y1 - plot.y0) / (dy1 - dy0);
  const map = (p: number[]): V => {
    const [x, y] = p as [number, number];
    return axes ? { x: plot.x0 + (x - dx0) * sx, y: plot.y1 - (y - dy0) * sy } : { x, y };
  };

  const items = new Map<string, Item>();
  const pending: PendingLabel[] = [];
  const drop = (id: string, why: string) => void notes.push(`${id}: ${why}`);
  const want = (item: Item, text: string | undefined, anchor: V, dir: V) => {
    if (text) pending.push({ item, text, anchor, dir: unit(dir) });
  };

  // 3a. Shapes without refs.
  for (const s of base) {
    switch (s.kind) {
      case "line": {
        const p = map(s.from);
        const q = map(s.to);
        if (len(sub(q, p)) < 0.5) {
          drop(s.id, "line has no length");
          break;
        }
        const item: Item = { id: s.id, geo: { kind: "line", p, q, dashed: s.dashed ?? false, ground: s.ground ?? false, color: s.color ?? "ink" } };
        items.set(s.id, item);
        const t = unit(sub(q, p));
        let n = { x: t.y, y: -t.x };
        if (n.y > 0 || (n.y === 0 && n.x < 0)) n = mul(n, -1);
        want(item, s.label, mul(add(p, q), 0.5), n);
        break;
      }
      case "text":
        items.set(s.id, { id: s.id, geo: { kind: "text", p: map(s.at), text: s.text, size: s.size ?? "m", color: s.color ?? "ink" } });
        break;
      case "point": {
        const p = map(s.at);
        if (axes && !inside({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }, grow(plot, 0.5))) {
          drop(s.id, "point outside the axes ranges");
          break;
        }
        const item: Item = { id: s.id, geo: { kind: "point", p, color: s.color ?? "ink" } };
        items.set(s.id, item);
        want(item, s.label, p, { x: 1, y: -1 });
        break;
      }
      case "polyline": {
        let pts = s.points.map(map);
        if (axes) pts = clipPolyline(pts, grow(plot, 0.5));
        if (pts.length < 2) {
          drop(s.id, "polyline outside the axes ranges");
          break;
        }
        const item: Item = { id: s.id, geo: { kind: "polyline", pts, closed: s.closed ?? false, smooth: s.smooth ?? false, fill: s.fill ?? "none", color: s.color ?? "ink" } };
        items.set(s.id, item);
        want(item, s.label, pts[pts.length - 1] as V, { x: 1, y: -1 });
        break;
      }
      case "axes": {
        if (s !== axes) break;
        const ox = dx0 <= 0 && 0 <= dx1 ? 0 : dx0;
        const oy = dy0 <= 0 && 0 <= dy1 ? 0 : dy0;
        const xa: [V, V] = [map([dx0, oy]), map([dx1, oy])];
        const ya: [V, V] = [map([ox, dy0]), map([ox, dy1])];
        const ticks: Extract<Geo, { kind: "axes" }>["ticks"] = [];
        const fs = DIAGRAM_FONT_SIZE.s;
        for (const v of s.x_ticks ?? []) {
          if (v < dx0 || v > dx1) continue;
          const p = map([v, oy]);
          ticks.push({ axis: "x", p, label: { text: fmtTick(v), x: p.x, y: p.y + fs * 0.9 + 1.5, size: "s" } });
        }
        for (const v of s.y_ticks ?? []) {
          if (v < dy0 || v > dy1) continue;
          // The origin is labeled once, on the x axis.
          if (v === oy && (s.x_ticks ?? []).includes(ox)) continue;
          const p = map([ox, v]);
          const text = fmtTick(v);
          ticks.push({ axis: "y", p, label: { text, x: p.x - 2 - labelSize(text, "s").w / 2, y: p.y, size: "s" } });
        }
        const lx = s.x_label ? { text: s.x_label, size: "m" as const } : undefined;
        const ly = s.y_label ? { text: s.y_label, size: "m" as const } : undefined;
        items.set(s.id, {
          id: s.id,
          geo: {
            kind: "axes",
            x: xa,
            y: ya,
            ticks,
            x_label: lx && { ...lx, x: xa[1].x - labelSize(lx.text, "m").w / 2, y: xa[1].y - 4.5 },
            y_label: ly && { ...ly, x: ya[1].x + 2.5 + labelSize(ly.text, "m").w / 2, y: ya[1].y + 1 },
          },
        });
        break;
      }
      default:
        break;
    }
  }

  // 3b. Boxes (may sit on a line or polyline).
  for (const s of base) {
    if (s.kind !== "rect") continue;
    const [w, h] = axes ? [s.w * sx, s.h * sy] : [s.w, s.h];
    let c: V;
    let angle = s.angle ?? 0;
    if (s.on) {
      const target = items.get(s.on.ref)?.geo;
      const segs: [V, V][] =
        target?.kind === "line" ? [[target.p, target.q]] : target?.kind === "polyline" ? segmentsOf(target).concat(target.closed ? [[target.pts.at(-1) as V, target.pts[0] as V]] : []) : [];
      if (!segs.length) {
        drop(s.id, `rect on unknown line "${s.on.ref}"`);
        continue;
      }
      const seg =
        s.on.segment !== undefined
          ? segs[s.on.segment]
          : [...segs].sort((a, b) => len(sub(b[1], b[0])) - len(sub(a[1], a[0])))[0];
      if (!seg) {
        drop(s.id, `rect on missing segment ${s.on.segment} of "${s.on.ref}"`);
        continue;
      }
      let [p, q] = seg;
      if (q.x < p.x) [p, q] = [q, p];
      const u = unit(sub(q, p));
      const n = { x: u.y, y: -u.x }; // points up (screen) for a left-to-right segment
      const at = add(p, mul(sub(q, p), s.on.t ?? 0.5));
      c = add(at, mul(n, h / 2 + 0.3));
      angle = (Math.atan2(-u.y, u.x) * 180) / Math.PI;
    } else if (s.x !== undefined && s.y !== undefined) {
      if (axes) {
        const a = map([s.x, s.y]);
        const b = map([s.x + s.w, s.y + s.h]);
        c = mul(add(a, b), 0.5);
      } else c = { x: s.x + w / 2, y: s.y + h / 2 };
    } else {
      drop(s.id, "rect needs x and y, or on");
      continue;
    }
    const item: Item = { id: s.id, geo: { kind: "rect", c, w, h, angle, fill: s.fill ?? "none", color: s.color ?? "ink" } };
    items.set(s.id, item);
    if (s.label) item.label = { text: s.label, x: c.x, y: c.y, size: "m" };
  }

  // 3c. Arrows: anchored on a box side, a point or a line; lengths proportional to the magnitudes.
  const arrows = base.filter((s): s is Extract<DiagramShapeBase, { kind: "arrow" }> => s.kind === "arrow");
  const maxMag = Math.max(0, ...arrows.map((a) => a.magnitude ?? 0));
  for (const s of arrows) {
    let start: V;
    let normal: V | undefined;
    if ("at" in s.from) start = map(s.from.at);
    else {
      const target = items.get(s.from.ref)?.geo;
      if (target?.kind === "rect") {
        const side = s.from.side ?? "center";
        const local = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, center: { x: 0, y: 0 } }[side];
        start = add(target.c, rot({ x: (local.x * target.w) / 2, y: (local.y * target.h) / 2 }, target.angle));
        normal = rot(side === "center" ? { x: 0, y: -1 } : local, target.angle);
      } else if (target?.kind === "point") start = target.p;
      else if (target?.kind === "line") {
        start = mul(add(target.p, target.q), 0.5);
        const t = unit(sub(target.q, target.p));
        normal = { x: t.y, y: -t.x };
        if (normal.y > 0) normal = mul(normal, -1);
      } else {
        drop(s.id, `arrow from unknown shape "${s.from.ref}"`);
        continue;
      }
    }
    let end: V;
    if (s.to) end = map(s.to);
    else {
      const d =
        s.deg !== undefined
          ? fromDeg(s.deg)
          : s.dir === "normal"
            ? normal
            : s.dir
              ? { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[s.dir]
              : undefined;
      if (!d) {
        drop(s.id, s.dir === "normal" ? "dir normal needs a box or line in from.ref" : "arrow needs dir, deg or to");
        continue;
      }
      if (s.magnitude !== undefined && s.magnitude <= 0) {
        drop(s.id, "zero magnitude");
        continue;
      }
      const L = s.magnitude !== undefined && maxMag > 0 ? Math.max(MIN_FORCE_LEN, (MAX_FORCE_LEN * s.magnitude) / maxMag) : LENGTH[s.length ?? "m"];
      end = add(start, mul(unit(d), L));
    }
    if (len(sub(end, start)) < 1) {
      drop(s.id, "arrow has no length");
      continue;
    }
    const item: Item = { id: s.id, geo: { kind: "arrow", p: start, q: end, color: s.color ?? "ink" } };
    items.set(s.id, item);
    want(item, s.label, end, sub(end, start));
  }

  // 4a. A box label sits at the center unless an arrow starts there (forces drawn from the center of mass):
  // then it moves to the upper-left quarter of the box, so the arrow never crosses the text.
  for (const i of items.values()) {
    if (i.geo.kind !== "rect" || !i.label) continue;
    const g = i.geo;
    const busy = [...items.values()].some((a) => a.geo.kind === "arrow" && len(sub(a.geo.p, g.c)) < 0.5);
    if (busy) i.label = { ...i.label, ...add(g.c, rot({ x: -g.w / 4, y: -g.h / 4 }, g.angle)) };
  }

  // 4b. Labels past arrow tips / beside lines and points, nudged off boxes, lines and other labels.
  const ordered = base.map((s) => items.get(s.id)).filter((i): i is Item => !!i);
  const boxes = ordered.filter((i) => i.geo.kind === "rect").map((i) => ({ id: i.id, box: boxOf(rectCorners(i.geo as Extract<Geo, { kind: "rect" }>)) }));
  const placed: { id: string; box: Box }[] = [];
  for (const i of ordered) {
    if (i.label) placed.push({ id: i.id, box: labelBox(i.label) });
    if (i.geo.kind === "text") placed.push({ id: i.id, box: boxOf(pointsOf(i.geo)) });
    if (i.geo.kind === "axes") for (const t of i.geo.ticks) placed.push({ id: i.id, box: labelBox(t.label) });
  }
  const segs = ordered.flatMap((i) => segmentsOf(i.geo).map((s) => ({ id: i.id, s })));
  for (const pl of pending) {
    const size = "m" as const;
    const { w, h } = labelSize(pl.text, size);
    const extent = (d: V) => Math.abs(d.x) * (w / 2) + Math.abs(d.y) * (h / 2);
    const candidates = [0, 40, -40, 90, -90, 135, -135, 180].flatMap((deg) => {
      const d = rot(pl.dir, deg);
      return [LABEL_GAP, LABEL_GAP + 3].map((gap) => add(pl.anchor, mul(d, gap + extent(d))));
    });
    const free = (c: V) => {
      const b: Box = { x0: c.x - w / 2, y0: c.y - h / 2, x1: c.x + w / 2, y1: c.y + h / 2 };
      if (!inside(b, viewBox)) return false;
      if (boxes.some((o) => overlaps(b, grow(o.box, 0.5)))) return false;
      if (placed.some((o) => overlaps(b, grow(o.box, 0.5)))) return false;
      return !segs.some((o) => clipSegment(o.s[0], o.s[1], grow(b, 0.3)) !== null);
    };
    const c = candidates.find(free) ?? (candidates[0] as V);
    pl.item.label = { text: pl.text, x: c.x, y: c.y, size };
    placed.push({ id: pl.item.id, box: labelBox(pl.item.label) });
  }

  if (ordered.length === 0) return { args: null, notes, reason: "empty diagram: no valid shape" };

  // 5. Fit to the frame: one uniform scale (never per-axis) plus a shift; labels move, their size does not.
  const all = boxOf(
    ordered.flatMap((i) => {
      const pts = [...pointsOf(i.geo)];
      const labels = [i.label, ...(i.geo.kind === "axes" ? [i.geo.x_label, i.geo.y_label, ...i.geo.ticks.map((t) => t.label)] : [])];
      for (const l of labels) if (l) pts.push({ x: labelBox(l).x0, y: labelBox(l).y0 }, { x: labelBox(l).x1, y: labelBox(l).y1 });
      return pts;
    }),
  );
  const room = { w: view.w - 2 * FIT_MARGIN, h: view.h - 2 * FIT_MARGIN };
  const bw = all.x1 - all.x0;
  const bh = all.y1 - all.y0;
  const k = Math.min(1, room.w / Math.max(bw, 1e-6), room.h / Math.max(bh, 1e-6));
  let shift: V;
  if (k < 1) {
    shift = { x: (view.w - bw * k) / 2 - all.x0 * k, y: (view.h - bh * k) / 2 - all.y0 * k };
    notes.push(`scaled by ${k.toFixed(2)} to fit the frame`);
  } else {
    const fx = all.x0 < FIT_MARGIN ? FIT_MARGIN - all.x0 : all.x1 > view.w - FIT_MARGIN ? view.w - FIT_MARGIN - all.x1 : 0;
    const fy = all.y0 < FIT_MARGIN ? FIT_MARGIN - all.y0 : all.y1 > view.h - FIT_MARGIN ? view.h - FIT_MARGIN - all.y1 : 0;
    shift = { x: fx, y: fy };
  }
  const T = (p: V): V => ({ x: round(p.x * k + shift.x), y: round(p.y * k + shift.y) });
  const TL = (l: DiagramLabel | undefined): DiagramLabel | undefined => l && { ...l, ...T(l) };
  const seg = (a: V, b: V) => {
    const p = T(a);
    const q = T(b);
    return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
  };

  const shapes: DiagramShape[] = ordered.map((i): DiagramShape => {
    const g = i.geo;
    const label = TL(i.label);
    const withLabel = <S extends object>(s: S) => (label ? { ...s, label } : s);
    switch (g.kind) {
      case "rect": {
        const c = T(g.c);
        const w = round(g.w * k);
        const h = round(g.h * k);
        return withLabel({ id: i.id, kind: "rect" as const, x: round(c.x - w / 2), y: round(c.y - h / 2), w, h, angle: round(g.angle), fill: g.fill, color: g.color });
      }
      case "line":
        return withLabel({ id: i.id, kind: "line" as const, ...seg(g.p, g.q), dashed: g.dashed, ground: g.ground, color: g.color });
      case "arrow":
        return withLabel({ id: i.id, kind: "arrow" as const, ...seg(g.p, g.q), color: g.color });
      case "text":
        return { id: i.id, kind: "text", ...T(g.p), text: g.text, size: g.size, color: g.color };
      case "axes": {
        const x_label = TL(g.x_label);
        const y_label = TL(g.y_label);
        return {
          id: i.id,
          kind: "axes",
          x_axis: seg(g.x[0], g.x[1]),
          y_axis: seg(g.y[0], g.y[1]),
          ticks: g.ticks.map((t) => ({ axis: t.axis, ...T(t.p), label: TL(t.label) as DiagramLabel })),
          ...(x_label ? { x_label } : {}),
          ...(y_label ? { y_label } : {}),
        };
      }
      case "polyline":
        return withLabel({ id: i.id, kind: "polyline" as const, points: g.pts.map((p) => { const t = T(p); return [t.x, t.y]; }), closed: g.closed, smooth: g.smooth, fill: g.fill, color: g.color });
      case "point":
        return withLabel({ id: i.id, kind: "point" as const, ...T(g.p), color: g.color });
    }
  });

  return { args: { id: env.data.id, column: env.data.column, title, frame, view: { ...view }, shapes }, notes };
}
