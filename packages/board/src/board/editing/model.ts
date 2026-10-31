// Pure rules of the student's board editing (plan F): what a block allows, where a drag drops it and how the
// keyboard move mode steps. No DOM here, so it is unit-tested.
import type { Column } from "@mento/contracts";
import { type BoardState, COLUMNS, type ElementState } from "../../store";

export interface EditPermissions {
  move: boolean;
  remove: boolean;
}

/**
 * A block being written, or from the turn still playing, allows nothing yet. An unanswered question can move but
 * not be deleted; an image placeholder can move but not be deleted until the drawing lands.
 */
export function editPermissions(
  element: ElementState,
  {
    writing,
    locked,
    openQuestionId,
  }: { writing: boolean; locked: boolean; openQuestionId: string | null },
): EditPermissions {
  if (writing || locked) return { move: false, remove: false };
  const openQuestion = element.type === "question" && element.id === openQuestionId;
  const placeholder = element.status === "placeholder";
  return { move: true, remove: !openQuestion && !placeholder };
}

/** Where a block would land: in `column`, right after `after_id` (null = top). */
export interface DropTarget {
  column: Column;
  after_id: string | null;
}

/** A block's vertical extent (any shared unit). */
export interface Span {
  id: string;
  top: number;
  bottom: number;
}

/** The slot under `y`: after the last neighbour whose midpoint is above it (the slot switches at 50 %). */
export function slotAt(y: number, spans: readonly Span[]): string | null {
  let after: string | null = null;
  for (const s of spans) {
    if ((s.top + s.bottom) / 2 < y) after = s.id;
    else break;
  }
  return after;
}

export interface ColumnSpan {
  column: Column;
  left: number;
  right: number;
}

/** Switches the target column only once the pointer is 30 % into another column; over the gaps it stays. */
export function pickColumn(
  current: Column,
  x: number,
  columns: readonly ColumnSpan[],
  share = 0.3,
): Column {
  const cur = columns.find((c) => c.column === current);
  for (const c of columns) {
    if (c.column === current || x < c.left || x > c.right) continue;
    const w = c.right - c.left;
    const fromRight = !cur || cur.left > c.left;
    if (fromRight ? x <= c.right - w * share : x >= c.left + w * share) return c.column;
  }
  return current;
}

/** Same place as now (dropping there changes nothing). */
export function isSamePlace(state: BoardState, id: string, target: DropTarget): boolean {
  const el = state.elements.get(id);
  if (!el || el.column !== target.column) return false;
  const ids = state.columns[el.column];
  return (ids[ids.indexOf(id) - 1] ?? null) === target.after_id;
}

export type MoveKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/**
 * Keyboard move mode: ↑/↓ step one slot inside the column, ←/→ go to the neighbouring column (same position,
 * or its end). `allowColumns` false keeps ←/→ inert.
 */
export function stepTarget(
  state: BoardState,
  id: string,
  target: DropTarget,
  key: MoveKey,
  allowColumns = true,
): DropTarget {
  const others = (column: Column) => state.columns[column].filter((x) => x !== id);
  const ids = others(target.column);
  const index = target.after_id === null ? 0 : ids.indexOf(target.after_id) + 1;
  if (key === "ArrowUp")
    return { ...target, after_id: index <= 1 ? null : (ids[index - 2] ?? null) };
  if (key === "ArrowDown")
    return index >= ids.length ? target : { ...target, after_id: ids[index] ?? target.after_id };
  if (!allowColumns) return target;
  const c = COLUMNS.indexOf(target.column) + (key === "ArrowLeft" ? -1 : 1);
  const column = COLUMNS[c];
  if (!column) return target;
  const next = others(column);
  const at = Math.min(index, next.length);
  return { column, after_id: at === 0 ? null : (next[at - 1] ?? null) };
}

/** 1-based slot and slot count of a target, for the screen reader. */
export function slotLabel(
  state: BoardState,
  id: string,
  target: DropTarget,
): { position: number; total: number } {
  const ids = state.columns[target.column].filter((x) => x !== id);
  const position = target.after_id === null ? 1 : ids.indexOf(target.after_id) + 2;
  return { position, total: ids.length + 1 };
}
