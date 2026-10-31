// Pure board reducer: one Action in, next BoardState out. Never throws on bad targets:
// unknown ids are ignored and reported through `onWarning` (the model can reference stale ids).
import type { Annotation, BoardAction, BoardEdit, BoardState, ElementState, RemovedElement } from "./types";

export interface ApplyContext {
  /** Timestamp for `created_at`; defaults to Date.now(). */
  now?: number;
  onWarning?: (message: string) => void;
}

export function applyAction(state: BoardState, action: BoardAction, ctx: ApplyContext = {}): BoardState {
  const now = ctx.now ?? Date.now();
  const warn = (message: string) => ctx.onWarning?.(`${action.name} (${action.id}): ${message}`);
  // The student deleted this element: the tutor can neither change nor re-create it (late drawings included).
  const args = action.args as { id?: string; target_id?: string; element_id?: string };
  const target = args.target_id ?? args.element_id ?? args.id;
  if (target !== undefined && state.removed.has(target)) return (warn(`"${target}" was deleted by the student; dropped`), state);

  switch (action.name) {
    case "speak":
      return state;

    case "write_text": {
      const { id, column, html, sources, outside_material } = action.args;
      return upsert(state, { id, type: "text", author: "tutor", column, created_at: now, data: { html }, sources, outside_material, annotations: [] }, warn);
    }

    case "write_timeline": {
      const { id, column, events } = action.args;
      return upsert(state, { id, type: "timeline", author: "tutor", column, created_at: now, data: { events }, annotations: [] }, warn);
    }

    case "draw": {
      const { id, column, prompt, is_structured, max_dimensions } = action.args;
      return upsert(
        state,
        {
          id,
          type: is_structured ? "svg" : "image",
          author: "tutor",
          column,
          created_at: now,
          status: "placeholder",
          data: { prompt, is_structured, max_dimensions },
          annotations: [],
        },
        warn,
      );
    }

    case "draw_result": {
      const { element_id, url } = action.args;
      return finishDrawing(state, element_id, { url }, warn);
    }

    case "update_element": {
      const { id, html } = action.args;
      const el = state.elements.get(id);
      if (!el) return (warn(`unknown element "${id}"`), state);
      if (el.type !== "text") return (warn(`"${id}" is a ${el.type}; only text can be updated`), state);
      return replace(state, { ...el, data: { html } });
    }

    case "remove_element": {
      const { id } = action.args;
      const el = state.elements.get(id);
      if (!el) return (warn(`unknown element "${id}"`), state);
      return drop(state, el);
    }

    case "move_element": {
      const { id, column, after_id } = action.args;
      return applyEdit(state, { op: "move", element_id: id, column, after_id }, { onWarning: (m) => warn(m) });
    }

    case "place_element": {
      const { id, next_to, side } = action.args;
      const el = state.elements.get(id);
      if (!el) return (warn(`unknown element "${id}"`), state);
      const host = state.elements.get(next_to);
      if (next_to === id || !host) return (warn(`unknown anchor "${next_to}"`), state);
      if (host.near) return (warn(`"${next_to}" is attached to another block; no chains`), state);
      // Blocks attached to `id` move over to the new host's side (no chains).
      let next = pin(state, el, { near: { id: next_to, side } });
      for (const child of attachedTo(next, id)) next = pin(next, next.elements.get(child)!, { near: { id: next_to, side } });
      return next;
    }

    case "highlight":
    case "circle_annotate": {
      const el = state.elements.get(action.args.target_id);
      if (!el) return (warn(`unknown target "${action.args.target_id}"`), state);
      const shape = action.args.shape_id ? { shape_id: action.args.shape_id } : {};
      // Passage highlight (read loosely until `highlight.text_to_match` lands in @mento/contracts).
      const passage = action.name === "highlight" ? passageOf(action.args) : undefined;
      const annotation: Annotation =
        action.name === "highlight"
          ? { kind: "highlight", color: action.args.color, action_id: action.id, ...shape, ...(passage ? { text_to_match: passage } : {}) }
          : { kind: "circle", color: action.args.color, text_to_match: action.args.text_to_match, action_id: action.id, ...shape };
      return replace(state, { ...el, annotations: [...el.annotations, annotation] });
    }

    case "draw_diagram": {
      const { id, column, title, frame, view, shapes } = action.args;
      return upsert(state, { id, type: "diagram", author: "tutor", column, created_at: now, data: { title, frame, view, shapes }, annotations: [] }, warn);
    }

    case "ask_verification": {
      const { id, column, verification_id, concept, concept_key, question, kind } = action.args;
      return upsert(
        state,
        { id, type: "question", author: "tutor", column, created_at: now, data: { verification_id, concept, concept_key, question, kind }, annotations: [] },
        warn,
      );
    }
  }
}

function passageOf(args: object): string | undefined {
  const t = (args as { text_to_match?: unknown }).text_to_match;
  return typeof t === "string" && t.trim().length > 0 && t.length <= 120 ? t : undefined;
}

/**
 * The highlights drawn on a block's text: the latest whole-block marker, then every passage marker (they
 * coexist, each in its color). Diagram-shape highlights are drawn by the diagram itself.
 */
export function visibleHighlights(annotations: readonly Annotation[]): Extract<Annotation, { kind: "highlight" }>[] {
  const marks = annotations.filter((a): a is Extract<Annotation, { kind: "highlight" }> => a.kind === "highlight" && !a.shape_id);
  const whole = marks.findLast((a) => !a.text_to_match);
  return [...(whole ? [whole] : []), ...marks.filter((a) => a.text_to_match)];
}

/** Replays a list of actions from an empty or given board (used by tests and session resume). */
export function applyActions(state: BoardState, actions: readonly BoardAction[], ctx: ApplyContext = {}): BoardState {
  return actions.reduce((s, a) => applyAction(s, a, ctx), state);
}

/** A streamed structured drawing (`svg_chunk`s) is complete: swap the placeholder to the svg. */
export function applySvg(state: BoardState, element_id: string, svg: string, ctx: ApplyContext = {}): BoardState {
  return finishDrawing(state, element_id, { svg }, (m) => ctx.onWarning?.(`svg_chunk: ${m}`));
}

function finishDrawing(state: BoardState, element_id: string, result: { url?: string; svg?: string }, warn: (m: string) => void): BoardState {
  const el = state.elements.get(element_id);
  if (!el) return (warn(`unknown element "${element_id}"`), state);
  if (el.type !== "image" && el.type !== "svg") return (warn(`"${element_id}" is a ${el.type}, not a drawing`), state);
  const data = { ...el.data, url: result.url, svg: result.svg };
  return replace(state, { ...el, type: result.svg !== undefined ? "svg" : "image", status: "ready", data });
}

/**
 * A student edit (plan F): remove drops the element and its annotations and remembers the id; move takes it out
 * of its column (or off its free spot) and puts it in `column` right after `after_id` (null = top; an anchor no longer
 * there = the end); place (plan G) pins it at a free spot, out of the column flow.
 */
export function applyEdit(state: BoardState, edit: BoardEdit, ctx: ApplyContext = {}): BoardState {
  const warn = (message: string) => ctx.onWarning?.(`board ${edit.op} (${edit.element_id}): ${message}`);
  const el = state.elements.get(edit.element_id);
  if (!el) {
    if (!state.removed.has(edit.element_id)) warn("unknown element");
    return state;
  }
  if (edit.op === "remove") {
    const next = drop(state, el);
    return { ...next, removed: new Set(state.removed).add(el.id) };
  }
  if (edit.op === "place") return pin(state, el, { pos: { x: Math.round(edit.x), y: Math.round(edit.y) } });
  if (edit.after_id === el.id) return (warn("anchored to itself"), state);
  const pinned = isPinned(el);
  const columns = { ...state.columns, [el.column]: state.columns[el.column].filter((x) => x !== el.id) };
  const target = insertAfter(columns[edit.column], el.id, edit.after_id);
  const same = !pinned && el.column === edit.column && target.every((x, i) => x === state.columns[el.column][i]);
  if (same) return state;
  const elements = new Map(state.elements);
  if (el.column !== edit.column || pinned) elements.set(el.id, unpinned({ ...el, column: edit.column }));
  const free = pinned ? state.free.filter((x) => x !== el.id) : state.free;
  const attached = pinned ? state.attached.filter((x) => x !== el.id) : state.attached;
  return { ...state, elements, free, attached, columns: { ...columns, [edit.column]: target } };
}

const isPinned = (el: ElementState) => el.pos !== undefined || el.near !== undefined;

function unpinned(el: ElementState): ElementState {
  const { pos: _p, near: _n, ...rest } = el;
  return rest as ElementState;
}

/** Out of the column flow (if there) and off any spot: then pinned at `pos` or attached `near` another block. */
function pin(state: BoardState, el: ElementState, at: Pick<ElementState, "pos" | "near">): BoardState {
  const elements = new Map(state.elements);
  elements.set(el.id, { ...unpinned(el), ...at } as ElementState);
  const without = (ids: readonly string[]) => ids.filter((x) => x !== el.id);
  return {
    ...state,
    elements,
    columns: { ...state.columns, [el.column]: without(state.columns[el.column]) },
    free: at.pos ? [...without(state.free), el.id] : without(state.free),
    attached: at.near ? [...without(state.attached), el.id] : without(state.attached),
  };
}

/** The ids attached to `host` (plan G), in order. */
export function attachedTo(state: BoardState, host: string): string[] {
  return state.attached.filter((id) => state.elements.get(id)?.near?.id === host);
}

/** Undo of a student delete: the element comes back right after its old neighbour (or on top). */
export function restoreRemoved(state: BoardState, { element, after_id }: RemovedElement): BoardState {
  if (state.elements.has(element.id)) return state;
  const removed = new Set(state.removed);
  removed.delete(element.id);
  const elements = new Map(state.elements);
  elements.set(element.id, element);
  if (element.pos) return { ...state, elements, removed, free: [...state.free, element.id] };
  if (element.near && state.elements.has(element.near.id)) return { ...state, elements, removed, attached: [...state.attached, element.id] };
  if (element.near) elements.set(element.id, unpinned(element));
  const anchor = after_id !== null && state.columns[element.column].includes(after_id) ? after_id : null;
  return { ...state, elements, removed, columns: { ...state.columns, [element.column]: insertAfter(state.columns[element.column], element.id, anchor) } };
}

/** The id right above `id` in its column (null = first, or not on the board). */
export function anchorOf(state: BoardState, id: string): string | null {
  const el = state.elements.get(id);
  if (!el) return null;
  const ids = state.columns[el.column];
  return ids[ids.indexOf(id) - 1] ?? null;
}

function insertAfter(ids: readonly string[], id: string, after_id: string | null): string[] {
  if (after_id === null) return [id, ...ids];
  const at = ids.indexOf(after_id);
  if (at < 0) return [...ids, id];
  return [...ids.slice(0, at + 1), id, ...ids.slice(at + 1)];
}

function drop(state: BoardState, el: ElementState): BoardState {
  const elements = new Map(state.elements);
  elements.delete(el.id);
  let columns = { ...state.columns, [el.column]: state.columns[el.column].filter((x) => x !== el.id) };
  // Blocks attached to it go back to the end of their own column.
  const children = attachedTo(state, el.id);
  for (const id of children) {
    const child = state.elements.get(id)!;
    elements.set(id, unpinned(child));
    columns = { ...columns, [child.column]: [...columns[child.column], id] };
  }
  const gone = new Set([el.id, ...children]);
  return {
    ...state,
    elements,
    columns,
    free: state.free.filter((x) => x !== el.id),
    attached: state.attached.filter((x) => !gone.has(x)),
  };
}

function replace(state: BoardState, el: ElementState): BoardState {
  const elements = new Map(state.elements);
  elements.set(el.id, el);
  return { ...state, elements };
}

/** Insert a new element at the end of its column; an existing id is replaced in place (kept in its column). */
function upsert(state: BoardState, el: ElementState, warn: (m: string) => void): BoardState {
  const prev = state.elements.get(el.id);
  if (prev) {
    warn(`id "${el.id}" already on the board; replaced`);
    return replace(state, { ...el, column: prev.column, created_at: prev.created_at, annotations: prev.annotations, pos: prev.pos, near: prev.near } as ElementState);
  }
  const elements = new Map(state.elements);
  elements.set(el.id, el);
  return { ...state, elements, columns: { ...state.columns, [el.column]: [...state.columns[el.column], el.id] } };
}
