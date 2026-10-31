// Board state shapes (docs/16 §5.1): elements keyed by id + per-column order.
import type { z } from "zod";
import type {
  AskVerificationArgs,
  Citation,
  CircleAnnotateArgs,
  Column,
  DiagramBody,
  DrawArgs,
  HighlightArgs,
  WriteTimelineArgs,
} from "@mento/contracts";

export type ElementType = "text" | "timeline" | "image" | "svg" | "question" | "diagram";
export type Author = "tutor" | "student";

export type HighlightColor = z.infer<typeof HighlightArgs>["color"];
export type CircleColor = z.infer<typeof CircleAnnotateArgs>["color"];

/** `shape_id`: the annotation targets one shape of a diagram instead of the whole element / a text match. */
export type Annotation =
  | { kind: "highlight"; color: HighlightColor; action_id: string; shape_id?: string }
  | { kind: "circle"; color: CircleColor; text_to_match: string; action_id: string; shape_id?: string };

/** `draw` placeholder and its late result share one shape; `type` is image (url) or svg (streamed). */
export interface DrawData {
  prompt: string;
  is_structured: boolean;
  max_dimensions: z.infer<typeof DrawArgs>["max_dimensions"];
  url?: string;
  svg?: string;
}

type VerificationArgs = z.infer<typeof AskVerificationArgs>;

export interface ElementDataByType {
  text: { html: string };
  timeline: { events: z.infer<typeof WriteTimelineArgs>["events"] };
  image: DrawData;
  svg: DrawData;
  question: Pick<VerificationArgs, "verification_id" | "concept" | "concept_key" | "question" | "kind">;
  /** `draw_diagram`: resolved by the server, absolute geometry inside `view`. */
  diagram: DiagramBody;
}

interface ElementBase<T extends ElementType> {
  id: string;
  type: T;
  author: Author;
  column: Column;
  created_at: number;
  data: ElementDataByType[T];
  /** Only for `draw` elements: placeholder until the drawing arrives. */
  status?: "placeholder" | "ready";
  sources?: Citation[];
  outside_material?: boolean;
  annotations: Annotation[];
}

export type ElementState = { [T in ElementType]: ElementBase<T> }[ElementType];
export type ElementOf<T extends ElementType> = ElementBase<T>;

export interface BoardState {
  elements: ReadonlyMap<string, ElementState>;
  /** Element ids per column, in insertion order. Arrays are replaced (never mutated) on change. */
  columns: Readonly<Record<Column, readonly string[]>>;
}

export const COLUMNS: readonly Column[] = ["main", "visuals", "side"];

export const emptyBoard = (): BoardState => ({
  elements: new Map(),
  columns: { main: [], visuals: [], side: [] },
});
