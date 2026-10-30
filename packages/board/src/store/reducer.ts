// Pure board reducer: one TutorAction in, next BoardState out. Never throws on bad targets:
// unknown ids are ignored and reported through `onWarning` (the model can reference stale ids).
import type { Column, TutorAction } from "../protocol";
import type { BoardState, ElementState } from "./types";

export interface ApplyContext {
  /** Timestamp for `created_at`; defaults to Date.now(). */
  now?: number;
  onWarning?: (message: string) => void;
}

export function applyAction(state: BoardState, action: TutorAction, ctx: ApplyContext = {}): BoardState {
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

    case "write_latex": {
      const { id, column, latex } = action.args;
      return upsert(state, { id, type: "latex", author: "tutor", column, created_at: now, data: { latex }, annotations: [] }, warn);
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
      const { element_id, url, svg } = action.args;
      const el = state.elements.get(element_id);
      if (!el) return (warn(`unknown element "${element_id}"`), state);
      if (el.type !== "image" && el.type !== "svg") return (warn(`"${element_id}" is a ${el.type}, not a drawing`), state);
      const data = { ...el.data, url: svg ? undefined : url, svg };
      return replace(state, { ...el, type: svg ? "svg" : "image", status: "ready", data });
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
      const { target_id, color } = action.args;
      const el = state.elements.get(target_id);
      if (!el) return (warn(`unknown target "${target_id}"`), state);
      const annotation =
        action.name === "highlight"
          ? { kind: "highlight" as const, color, action_id: action.id }
          : { kind: "circle" as const, color, text_to_match: action.args.text_to_match, action_id: action.id };
      return replace(state, { ...el, annotations: [...el.annotations, annotation] });
    }

    case "ask_verification": {
      const { id, verification_id, concept, question, kind, choices } = action.args;
      const column: Column = "main"; // the protocol has no column for questions; they belong with the lesson
      return upsert(
        state,
        { id, type: "question", author: "tutor", column, created_at: now, data: { verification_id, concept, question, kind, choices }, annotations: [] },
        warn,
      );
    }
  }
}

/** Replays a list of actions from an empty or given board (used by tests and session resume). */
export function applyActions(state: BoardState, actions: readonly TutorAction[], ctx: ApplyContext = {}): BoardState {
  return actions.reduce((s, a) => applyAction(s, a, ctx), state);
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
