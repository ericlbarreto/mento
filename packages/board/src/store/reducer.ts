// Pure board reducer: one Action in, next BoardState out. Never throws on bad targets:
// unknown ids are ignored and reported through `onWarning` (the model can reference stale ids).
import type { Action } from "@mento/contracts";
import type { Annotation, BoardState, ElementState } from "./types";

export interface ApplyContext {
  /** Timestamp for `created_at`; defaults to Date.now(). */
  now?: number;
  onWarning?: (message: string) => void;
}

export function applyAction(state: BoardState, action: Action, ctx: ApplyContext = {}): BoardState {
  const now = ctx.now ?? Date.now();
  const warn = (message: string) => ctx.onWarning?.(`${action.name} (${action.id}): ${message}`);

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
      const elements = new Map(state.elements);
      elements.delete(id);
      return { elements, columns: { ...state.columns, [el.column]: state.columns[el.column].filter((x) => x !== id) } };
    }

    case "highlight":
    case "circle_annotate": {
      const el = state.elements.get(action.args.target_id);
      if (!el) return (warn(`unknown target "${action.args.target_id}"`), state);
      const annotation: Annotation =
        action.name === "highlight"
          ? { kind: "highlight", color: action.args.color, action_id: action.id }
          : { kind: "circle", color: action.args.color, text_to_match: action.args.text_to_match, action_id: action.id };
      return replace(state, { ...el, annotations: [...el.annotations, annotation] });
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

/** Replays a list of actions from an empty or given board (used by tests and session resume). */
export function applyActions(state: BoardState, actions: readonly Action[], ctx: ApplyContext = {}): BoardState {
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

function replace(state: BoardState, el: ElementState): BoardState {
  const elements = new Map(state.elements);
  elements.set(el.id, el);
  return { elements, columns: state.columns };
}

/** Insert a new element at the end of its column; an existing id is replaced in place (kept in its column). */
function upsert(state: BoardState, el: ElementState, warn: (m: string) => void): BoardState {
  const prev = state.elements.get(el.id);
  if (prev) {
    warn(`id "${el.id}" already on the board; replaced`);
    return replace(state, { ...el, column: prev.column, created_at: prev.created_at, annotations: prev.annotations } as ElementState);
  }
  const elements = new Map(state.elements);
  elements.set(el.id, el);
  return { elements, columns: { ...state.columns, [el.column]: [...state.columns[el.column], el.id] } };
}
