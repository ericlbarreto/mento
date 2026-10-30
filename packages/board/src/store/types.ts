// Board state shapes (docs/16 §5.1): elements keyed by id + per-column order.
import type {
  AnnotateColor,
  Citation,
  Column,
  DrawArgs,
  HighlightColor,
  TimelineEvent,
  VerificationKind,
} from "../protocol";

export type ElementType = "text" | "timeline" | "image" | "svg" | "latex" | "question";
export type Author = "tutor" | "student";

export interface Annotation {
  kind: "highlight" | "circle";
  color: HighlightColor | AnnotateColor;
  text_to_match?: string;
  action_id: string;
}

/** `draw` placeholder and its late result share one shape; `type` flips image/svg on the result. */
export interface DrawData {
  prompt: string;
  is_structured: boolean;
  max_dimensions: DrawArgs["max_dimensions"];
  url?: string;
  svg?: string;
}

export interface ElementDataByType {
  text: { html: string };
  timeline: { events: TimelineEvent[] };
  image: DrawData;
  svg: DrawData;
  latex: { latex: string };
  question: {
    verification_id: string;
    concept: string;
    question: string;
    kind: VerificationKind;
    choices?: string[];
  };
}

interface ElementBase<T extends ElementType> {
  id: string;
  type: T;
  author: Author;
  column: Column;
  created_at: number;
  data: ElementDataByType[T];
  /** Only for `draw` elements: placeholder until `draw_result` arrives. */
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
