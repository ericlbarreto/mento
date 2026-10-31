import { z } from "zod";

// Structured diagrams (`draw_diagram`, D75). The model sends a small list of primitives (`DiagramBodyBase`);
// the server resolver (packages/tutor/src/diagram) turns anchors, magnitudes and data units into absolute
// geometry (`DiagramBody`), the only shape the client and the replay ever see. `id` and `column` are added
// in actions.ts (this file must not import it).

/** Frame presets: the model never picks a viewBox. Grid units, 100 on the short side, y grows down. */
export const DiagramFrame = z.enum(["wide", "square", "tall"]);
export type DiagramFrame = z.infer<typeof DiagramFrame>;
export const DIAGRAM_FRAME_SIZE: Record<DiagramFrame, { w: number; h: number }> = {
  wide: { w: 160, h: 100 },
  square: { w: 100, h: 100 },
  tall: { w: 100, h: 160 },
};
export const MAX_DIAGRAM_SHAPES = 24;

/** Shape id inside one diagram: short snake_case slug (targets of `highlight` / `circle_annotate`). */
export const ShapeId = z.string().regex(/^[a-z][a-z0-9_]{0,30}$/, "shape id must be a short snake_case slug");
export const DiagramColor = z.enum(["ink", "red", "blue", "green"]);
export type DiagramColor = z.infer<typeof DiagramColor>;
export const DiagramTextSize = z.enum(["s", "m", "l"]);
export type DiagramTextSize = z.infer<typeof DiagramTextSize>;
/** Font size of a label, in grid units (the resolver estimates label boxes with it; the renderer uses it). */
export const DIAGRAM_FONT_SIZE: Record<DiagramTextSize, number> = { s: 4.5, m: 5.5, l: 7 };

/** Plain text only (rendered as SVG text, never HTML). */
const LabelText = z.string().min(1).max(40);
const Coord = z.number().min(-10000).max(10000);
/** [x, y]: grid units, or data units when the diagram has `axes`. */
const XY = z.array(Coord).length(2);

// ---- What the model sends ----

const RectBase = z.object({
  id: ShapeId,
  kind: z.literal("rect"),
  x: Coord.optional().describe("left edge; omit when using `on`"),
  y: Coord.optional().describe("top edge; omit when using `on`"),
  w: z.number().positive().max(1000),
  h: z.number().positive().max(1000),
  angle: z.number().min(-360).max(360).optional().describe("rotation in degrees, counter-clockwise"),
  on: z
    .object({
      ref: ShapeId.describe("id of a line or polyline"),
      segment: z.number().int().min(0).max(63).optional().describe("polyline segment index; default the longest"),
      t: z.number().min(0).max(1).optional().describe("position along the segment, 0..1; default 0.5"),
    })
    .optional()
    .describe("sit the box on a line or polyline segment (a floor, a ramp); the server computes position and angle"),
  label: LabelText.optional(),
  fill: z.enum(["none", "soft"]).optional(),
  color: DiagramColor.optional(),
});

const LineBase = z.object({
  id: ShapeId,
  kind: z.literal("line"),
  from: XY,
  to: XY,
  dashed: z.boolean().optional(),
  ground: z.boolean().optional().describe("hatch marks below (floor, table)"),
  label: LabelText.optional(),
  color: DiagramColor.optional(),
});

const ArrowFrom = z.union([
  z.object({ ref: ShapeId.describe("id of a rect, point or line"), side: z.enum(["top", "bottom", "left", "right", "center"]).optional() }),
  z.object({ at: XY }),
]);

const ArrowBase = z.object({
  id: ShapeId,
  kind: z.literal("arrow"),
  from: ArrowFrom,
  dir: z.enum(["up", "down", "left", "right", "normal"]).optional().describe("screen direction; normal = out of the ref box side"),
  deg: z.number().min(-360).max(360).optional().describe("direction in degrees, counter-clockwise from right (instead of dir)"),
  to: XY.optional().describe("absolute end point (instead of dir/deg)"),
  magnitude: z.number().min(0).max(1_000_000).optional().describe("e.g. the force in N; lengths are proportional within the diagram"),
  length: DiagramTextSize.optional().describe("s, m or l when there is no magnitude"),
  label: LabelText.optional(),
  color: DiagramColor.optional(),
});

const TextBase = z.object({
  id: ShapeId,
  kind: z.literal("text"),
  at: XY,
  text: LabelText,
  size: DiagramTextSize.optional(),
  color: DiagramColor.optional(),
});

const AxesBase = z.object({
  id: ShapeId,
  kind: z.literal("axes"),
  x_range: XY.describe("[min, max] in data units"),
  y_range: XY.describe("[min, max] in data units"),
  x_label: LabelText.optional(),
  y_label: LabelText.optional(),
  x_ticks: z.array(Coord).max(12).optional(),
  y_ticks: z.array(Coord).max(12).optional(),
});

const PolylineBase = z.object({
  id: ShapeId,
  kind: z.literal("polyline"),
  points: z.array(XY).min(2).max(64),
  closed: z.boolean().optional(),
  smooth: z.boolean().optional().describe("draw a smooth curve through the points (function graphs)"),
  fill: z.enum(["none", "soft"]).optional(),
  label: LabelText.optional(),
  color: DiagramColor.optional(),
});

const PointBase = z.object({
  id: ShapeId,
  kind: z.literal("point"),
  at: XY,
  label: LabelText.optional(),
  color: DiagramColor.optional(),
});

export const DiagramShapeBase = z.discriminatedUnion("kind", [RectBase, LineBase, ArrowBase, TextBase, AxesBase, PolylineBase, PointBase]);
export type DiagramShapeBase = z.infer<typeof DiagramShapeBase>;
export type DiagramShapeKind = DiagramShapeBase["kind"];

/** What the model may send (besides id and column). */
export const DiagramBodyBase = z.object({
  title: z.string().min(1).max(80).describe("short pt-BR caption"),
  frame: DiagramFrame,
  shapes: z.array(DiagramShapeBase).min(1).max(MAX_DIAGRAM_SHAPES),
});

// ---- What the client receives (resolved, absolute grid units inside `view`) ----

const N = z.number().finite();
/** A resolved label: plain text centered on (x, y). */
export const DiagramLabel = z.object({ text: LabelText, x: N, y: N, size: DiagramTextSize });
export type DiagramLabel = z.infer<typeof DiagramLabel>;
const Seg = z.object({ x1: N, y1: N, x2: N, y2: N });

const RectShape = z.object({
  id: ShapeId, kind: z.literal("rect"), x: N, y: N, w: N.positive(), h: N.positive(),
  /** Degrees counter-clockwise on screen, around the box center. */
  angle: N, fill: z.enum(["none", "soft"]), color: DiagramColor, label: DiagramLabel.optional(),
});
const LineShape = Seg.extend({ id: ShapeId, kind: z.literal("line"), dashed: z.boolean(), ground: z.boolean(), color: DiagramColor, label: DiagramLabel.optional() });
const ArrowShape = Seg.extend({ id: ShapeId, kind: z.literal("arrow"), color: DiagramColor, label: DiagramLabel.optional() });
const TextShape = z.object({ id: ShapeId, kind: z.literal("text"), x: N, y: N, text: LabelText, size: DiagramTextSize, color: DiagramColor });
const AxesShape = z.object({
  id: ShapeId, kind: z.literal("axes"), x_axis: Seg, y_axis: Seg,
  ticks: z.array(z.object({ axis: z.enum(["x", "y"]), x: N, y: N, label: DiagramLabel })).max(24),
  x_label: DiagramLabel.optional(), y_label: DiagramLabel.optional(),
});
const PolylineShape = z.object({
  id: ShapeId, kind: z.literal("polyline"), points: z.array(z.array(N).length(2)).min(2).max(64),
  closed: z.boolean(), smooth: z.boolean(), fill: z.enum(["none", "soft"]), color: DiagramColor, label: DiagramLabel.optional(),
});
const PointShape = z.object({ id: ShapeId, kind: z.literal("point"), x: N, y: N, color: DiagramColor, label: DiagramLabel.optional() });

export const DiagramShape = z.discriminatedUnion("kind", [RectShape, LineShape, ArrowShape, TextShape, AxesShape, PolylineShape, PointShape]);
export type DiagramShape = z.infer<typeof DiagramShape>;

export const DiagramBody = z.object({
  title: z.string().min(1).max(80),
  frame: DiagramFrame,
  /** The viewBox size (DIAGRAM_FRAME_SIZE[frame]). */
  view: z.object({ w: N.positive(), h: N.positive() }),
  shapes: z.array(DiagramShape).min(1).max(MAX_DIAGRAM_SHAPES),
});
export type DiagramBody = z.infer<typeof DiagramBody>;

/** Every label of a resolved diagram, in shape order (title first): what `circle_annotate` can match. */
export function diagramLabels(body: Pick<DiagramBody, "shapes">): { shape_id: string; text: string }[] {
  const out: { shape_id: string; text: string }[] = [];
  for (const s of body.shapes) {
    if (s.kind === "text") out.push({ shape_id: s.id, text: s.text });
    else if (s.kind === "axes") {
      for (const l of [s.x_label, s.y_label]) if (l) out.push({ shape_id: s.id, text: l.text });
    } else if (s.label) out.push({ shape_id: s.id, text: s.label.text });
  }
  return out;
}
