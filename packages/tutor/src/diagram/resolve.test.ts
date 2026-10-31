import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DiagramArgs, type DiagramLabel, type DiagramShape } from "@mento/contracts";
import { labelSize, resolveDiagram } from "./resolve";

const examples = (
  JSON.parse(readFileSync(new URL("../../../../fixtures/diagrams/examples.json", import.meta.url), "utf8")) as {
    examples: { name: string; input: Record<string, unknown>; output: unknown }[];
  }
).examples;
const input = (name: string) => structuredClone(examples.find((e) => e.name === name)!.input);

const resolve = (inp: unknown) => {
  const r = resolveDiagram(inp);
  if (!r.args) throw new Error(r.reason);
  return { ...r, args: r.args };
};
const shape = <K extends DiagramShape["kind"]>(shapes: DiagramShape[], id: string, kind: K) => {
  const s = shapes.find((x) => x.id === id);
  expect(s?.kind).toBe(kind);
  return s as Extract<DiagramShape, { kind: K }>;
};
const arrowLen = (a: { x1: number; y1: number; x2: number; y2: number }) => Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
const box = (l: DiagramLabel) => {
  const { w, h } = labelSize(l.text, l.size);
  return { x0: l.x - w / 2, y0: l.y - h / 2, x1: l.x + w / 2, y1: l.y + h / 2 };
};
const labelsOf = (shapes: DiagramShape[]) =>
  shapes.flatMap((s) => (s.kind === "axes" ? [s.x_label, s.y_label, ...s.ticks.map((t) => t.label)] : "label" in s ? [s.label] : [])).filter((l): l is DiagramLabel => !!l);

describe("resolveDiagram: golden examples", () => {
  it.each(examples.map((e) => [e.name, e] as const))("%s matches its stored output (pnpm diagrams:golden)", (_name, ex) => {
    const { args } = resolve(ex.input);
    expect(DiagramArgs.safeParse(args).success).toBe(true);
    expect(args).toEqual(ex.output);
  });

  it("keeps the newton-blocks turn fixture in sync with the free_body example", () => {
    const turn = JSON.parse(readFileSync(new URL("../../../../fixtures/turns/newton-blocks.json", import.meta.url), "utf8")) as {
      messages: { message: { type: string; action?: { name: string; args: unknown } } }[];
    };
    const draw = turn.messages.find((m) => m.message.action?.name === "draw_diagram")?.message.action;
    expect(draw?.args).toEqual(examples.find((e) => e.name === "free_body")!.output);
  });

  it.each(examples.map((e) => [e.name, e] as const))("%s keeps every label inside the frame", (_name, ex) => {
    const { args } = resolve(ex.input);
    for (const l of labelsOf(args.shapes)) {
      const b = box(l);
      expect(b.x0, l.text).toBeGreaterThanOrEqual(0);
      expect(b.y0, l.text).toBeGreaterThanOrEqual(0);
      expect(b.x1, l.text).toBeLessThanOrEqual(args.view.w);
      expect(b.y1, l.text).toBeLessThanOrEqual(args.view.h);
    }
  });
});

describe("resolveDiagram: free-body diagram", () => {
  const { args } = resolve(input("free_body"));
  const floor = shape(args.shapes, "chao", "line");
  const block = shape(args.shapes, "bloco", "rect");
  const f = shape(args.shapes, "forca", "arrow");
  const p = shape(args.shapes, "peso", "arrow");
  const n = shape(args.shapes, "normal", "arrow");

  it("sits the block on the floor", () => {
    expect(block.angle).toBe(0);
    expect(block.y + block.h).toBeCloseTo(floor.y1, 0);
    expect(block.label?.text).toBe("2 kg");
  });

  it("anchors each force on the block and points it the stated way", () => {
    expect(f.x1).toBeCloseTo(block.x + block.w, 1);
    expect(f.x2).toBeGreaterThan(f.x1);
    expect(f.y2).toBe(f.y1);
    expect(p.x1).toBeCloseTo(block.x + block.w / 2, 1);
    expect(p.y2).toBeGreaterThan(p.y1);
    expect(n.y1).toBeCloseTo(block.y, 1);
    expect(n.y2).toBeLessThan(n.y1);
  });

  it("makes lengths proportional to the magnitudes", () => {
    expect(arrowLen(p)).toBeCloseTo(arrowLen(n), 1);
    expect(arrowLen(p) / arrowLen(f)).toBeCloseTo(2, 1);
  });

  it("puts each label past its arrow tip and off the block", () => {
    const blockBox = { x0: block.x, y0: block.y, x1: block.x + block.w, y1: block.y + block.h };
    for (const a of [f, p, n]) {
      const b = box(a.label!);
      const hitsBlock = b.x0 < blockBox.x1 && blockBox.x0 < b.x1 && b.y0 < blockBox.y1 && blockBox.y0 < b.y1;
      expect(hitsBlock, a.id).toBe(false);
      // Closer to the tip than to the tail.
      expect(Math.hypot(a.label!.x - a.x2, a.label!.y - a.y2)).toBeLessThan(Math.hypot(a.label!.x - a.x1, a.label!.y - a.y1));
    }
    expect(f.label!.x).toBeGreaterThan(f.x2);
    expect(n.label!.y).toBeLessThan(n.y2);
  });
});

describe("resolveDiagram: block on an incline", () => {
  const { args } = resolve(input("incline"));
  const block = shape(args.shapes, "bloco", "rect");
  const n = shape(args.shapes, "normal", "arrow");
  const p = shape(args.shapes, "peso", "arrow");
  const fat = shape(args.shapes, "atrito", "arrow");
  const slope = (Math.atan2(85 - 30, 145 - 15) * 180) / Math.PI; // the ramp goes down to the right

  it("tilts the block to the ramp's angle and sits it on the ramp", () => {
    expect(block.angle).toBeCloseTo(-slope, 0);
    const cx = block.x + block.w / 2;
    const cy = block.y + block.h / 2;
    // Distance from the center to the ramp line = half the block height.
    const [ax, ay, bx, by] = [15, 30, 145, 85];
    const dist = Math.abs((by - ay) * cx - (bx - ax) * cy + bx * ay - by * ax) / Math.hypot(by - ay, bx - ax);
    expect(dist).toBeCloseTo(block.h / 2, 0);
  });

  it("points the normal perpendicular to the ramp, weight straight down, friction up the ramp", () => {
    const nd = { x: n.x2 - n.x1, y: n.y2 - n.y1 };
    const ramp = { x: 130, y: 55 };
    expect(Math.abs(nd.x * ramp.x + nd.y * ramp.y) / (Math.hypot(nd.x, nd.y) * Math.hypot(ramp.x, ramp.y))).toBeLessThan(0.01);
    expect(nd.y).toBeLessThan(0);
    expect(p.x2).toBe(p.x1);
    expect(fat.x2).toBeLessThan(fat.x1);
    expect(fat.y2).toBeLessThan(fat.y1);
  });
});

describe("resolveDiagram: function graph", () => {
  const { args } = resolve(input("function_square"));
  const axes = shape(args.shapes, "eixos", "axes");
  const curve = shape(args.shapes, "curva", "polyline");
  const point = shape(args.shapes, "ponto", "point");

  it("maps data units into the plot area, y up", () => {
    // x = 0 is the middle of the x axis; the y axis crosses there.
    expect(axes.y_axis.x1).toBeCloseTo((axes.x_axis.x1 + axes.x_axis.x2) / 2, 1);
    const [, firstY] = curve.points[0] as [number, number];
    const [, middleY] = curve.points[6] as [number, number];
    expect(firstY).toBeLessThan(middleY); // f(-3) = 9 is higher on screen than f(0) = 0
    const xs = curve.points.map((p) => p[0] as number);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(curve.smooth).toBe(true);
  });

  it("puts the point on the curve and labels the ticks", () => {
    const [x2, y2] = curve.points[10] as [number, number]; // x = 2
    expect(point.x).toBeCloseTo(x2, 1);
    expect(point.y).toBeCloseTo(y2, 1);
    expect(axes.ticks.filter((t) => t.axis === "x").map((t) => t.label.text)).toEqual(["−3", "−2", "−1", "1", "2", "3"]);
    expect(axes.x_label?.text).toBe("x");
    expect(axes.y_label?.text).toBe("f(x)");
  });

  it("cuts a curve that leaves the y range instead of drawing outside the plot", () => {
    const inp = input("function_square");
    (inp.shapes as { id: string; points?: number[][] }[])[1]!.points = [-4, -3, -2, 0, 2, 3, 4].map((x) => [x, x * x]);
    const c = shape(resolve(inp).args.shapes, "curva", "polyline");
    const yTop = axes.y_axis.y2;
    for (const [, y] of c.points) expect(y!).toBeGreaterThanOrEqual(yTop - 0.6);
  });
});

describe("resolveDiagram: invalid input", () => {
  const base = { id: "d", column: "visuals", title: "Teste", frame: "wide" };

  it("drops shapes it cannot resolve and keeps the rest", () => {
    const { args, notes } = resolve({
      ...base,
      shapes: [
        { id: "chao", kind: "line", from: [10, 70], to: [150, 70] },
        { id: "seta", kind: "arrow", from: { ref: "caixa" }, dir: "up", label: "F" },
        { id: "nuvem", kind: "cloud" },
        { id: "chao", kind: "line", from: [0, 0], to: [10, 10] },
        { id: "sem_dir", kind: "arrow", from: { at: [10, 10] } },
        { id: "caixa_solta", kind: "rect", w: 10, h: 10 },
        { id: "zero", kind: "arrow", from: { at: [10, 10] }, dir: "up", magnitude: 0 },
      ],
    });
    expect(args.shapes.map((s) => s.id)).toEqual(["chao"]);
    expect(notes.join("\n")).toMatch(/seta: arrow from unknown shape "caixa"/);
    expect(notes.join("\n")).toMatch(/nuvem/);
    expect(notes.join("\n")).toMatch(/duplicate id/);
    expect(notes.join("\n")).toMatch(/sem_dir: arrow needs dir, deg or to/);
    expect(notes.join("\n")).toMatch(/caixa_solta: rect needs x and y, or on/);
    expect(notes.join("\n")).toMatch(/zero: zero magnitude/);
  });

  it("returns null for an empty diagram or a broken envelope", () => {
    expect(resolveDiagram({ ...base, shapes: [{ id: "x", kind: "cloud" }] }).args).toBeNull();
    expect(resolveDiagram({ ...base, shapes: [] }).reason).toMatch(/empty/);
    expect(resolveDiagram({ ...base, id: "Not A Slug", shapes: [] }).reason).toMatch(/invalid draw_diagram: id/);
    expect(resolveDiagram("nope").args).toBeNull();
  });

  it("caps the shapes at 24, defaults the frame and the title", () => {
    const shapes = Array.from({ length: 30 }, (_, i) => ({ id: `p_${i}`, kind: "point", at: [5 + i * 5, 50] }));
    const { args, notes } = resolve({ id: "d", column: "main", frame: "huge", shapes });
    expect(args.shapes).toHaveLength(24);
    expect(args.frame).toBe("wide");
    expect(args.title).toBe("Diagrama");
    expect(notes[0]).toMatch(/6 shapes over the limit/);
  });

  it("scales an oversized diagram uniformly to fit the frame", () => {
    const { args, notes } = resolve({
      ...base,
      shapes: [
        { id: "a", kind: "rect", x: 0, y: 0, w: 300, h: 100 },
        { id: "b", kind: "rect", x: 100, y: 120, w: 60, h: 60 },
      ],
    });
    const a = shape(args.shapes, "a", "rect");
    const b = shape(args.shapes, "b", "rect");
    expect(a.w / a.h).toBeCloseTo(3, 1);
    expect(b.w).toBeCloseTo(b.h, 1);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x + a.w).toBeLessThanOrEqual(args.view.w);
    expect(b.y + b.h).toBeLessThanOrEqual(args.view.h);
    expect(notes.some((n) => n.startsWith("scaled by"))).toBe(true);
  });

  it("shifts a diagram that sticks out without scaling it", () => {
    const { args } = resolve({ ...base, shapes: [{ id: "a", kind: "rect", x: -10, y: 10, w: 40, h: 20 }] });
    const a = shape(args.shapes, "a", "rect");
    expect(a.w).toBe(40);
    expect(a.x).toBeGreaterThanOrEqual(0);
  });
});
