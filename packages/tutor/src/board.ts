import { diagramLabels, type Action } from "@mento/contracts";

export type ElementType = "text" | "timeline" | "image" | "question" | "diagram";

export interface BoardElement {
  id: string;
  type: ElementType;
  column: string;
  text: string;
  /** Only diagrams: every shape id with its label (targets of highlight / circle_annotate with shape_id). */
  shapes?: { id: string; kind: string; label?: string }[];
}

export type Validation = { ok: true } | { ok: false; reason: string };

const OK: Validation = { ok: true };
const fail = (reason: string): Validation => ({ ok: false, reason });

const stripTags = (html: string): string =>
  html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const norm = (s: string): string => s.replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");

function created(action: Action): BoardElement | null {
  switch (action.name) {
    case "write_text":
      return { id: action.args.id, type: "text", column: action.args.column, text: stripTags(action.args.html) };
    case "write_timeline":
      return {
        id: action.args.id,
        type: "timeline",
        column: action.args.column,
        text: action.args.events.map((e) => `${e.date} ${e.label}`).join(" · "),
      };
    case "draw":
      return { id: action.args.id, type: "image", column: action.args.column, text: action.args.prompt };
    case "ask_verification":
      return { id: action.args.id, type: "question", column: action.args.column, text: action.args.question };
    case "draw_diagram": {
      const labels = diagramLabels(action.args);
      return {
        id: action.args.id,
        type: "diagram",
        column: action.args.column,
        text: [action.args.title, ...labels.map((l) => l.text)].join(" · "),
        shapes: action.args.shapes.map((s) => ({ id: s.id, kind: s.kind, label: labels.find((l) => l.shape_id === s.id)?.text })),
      };
    }
    default:
      return null;
  }
}

/** The board as the server knows it: rebuilt from `tutor_action` events, used to validate every new action. */
export class Board {
  private readonly elements = new Map<string, BoardElement>();

  has(id: string): boolean {
    return this.elements.has(id);
  }

  get(id: string): BoardElement | undefined {
    return this.elements.get(id);
  }

  validate(action: Action): Validation {
    switch (action.name) {
      case "speak":
        return OK;
      case "write_text":
      case "write_timeline":
      case "draw":
      case "ask_verification":
      case "draw_diagram":
        return this.elements.has(action.args.id) ? fail(`duplicate element id: ${action.args.id}`) : OK;
      case "highlight": {
        const target = this.elements.get(action.args.target_id);
        if (!target) return fail(`unknown target: ${action.args.target_id}`);
        return action.args.shape_id ? this.hasShape(target, action.args.shape_id) : OK;
      }
      case "circle_annotate": {
        const target = this.elements.get(action.args.target_id);
        if (!target) return fail(`unknown target: ${action.args.target_id}`);
        if (action.args.shape_id) return this.hasShape(target, action.args.shape_id);
        return norm(target.text).includes(norm(action.args.text_to_match))
          ? OK
          : fail(`text_to_match not found in ${action.args.target_id}`);
      }
      case "update_element": {
        const target = this.elements.get(action.args.id);
        if (!target) return fail(`unknown element: ${action.args.id}`);
        return target.type === "text" ? OK : fail(`only text elements can be updated: ${action.args.id}`);
      }
      case "remove_element":
        return this.elements.has(action.args.id) ? OK : fail(`unknown element: ${action.args.id}`);
      case "draw_result":
        return fail("draw_result is server-only");
    }
  }

  private hasShape(target: BoardElement, shape_id: string): Validation {
    if (!target.shapes) return fail(`${target.id} is not a diagram: shape_id needs a draw_diagram element`);
    return target.shapes.some((s) => s.id === shape_id) ? OK : fail(`unknown shape ${shape_id} in ${target.id}`);
  }

  apply(action: Action): void {
    const el = created(action);
    if (el) {
      this.elements.set(el.id, el);
    } else if (action.name === "update_element") {
      const target = this.elements.get(action.args.id);
      if (target) target.text = stripTags(action.args.html);
    } else if (action.name === "remove_element") {
      this.elements.delete(action.args.id);
    }
  }

  /**
   * One compact line per element: `id | type | column | text` (given to the model every turn). A diagram lists its
   * shapes instead of its text: `shapes: bloco (rect "2 kg"), seta_f (arrow "F")`.
   */
  snapshot(maxText = 120): string {
    if (this.elements.size === 0) return "(the board is empty)";
    const clip = (t: string) => (t.length > maxText ? `${t.slice(0, maxText - 1)}…` : t);
    return [...this.elements.values()]
      .map((e) => {
        if (!e.shapes) return `${e.id} | ${e.type} | ${e.column} | ${clip(e.text)}`;
        const shapes = e.shapes.map((s) => `${s.id} (${s.kind}${s.label ? ` "${s.label}"` : ""})`).join(", ");
        return `${e.id} | ${e.type} | ${e.column} | ${clip(e.text.split(" · ")[0] ?? "")} | shapes: ${shapes}`;
      })
      .join("\n");
  }

  static fromActions(actions: Action[]): Board {
    const board = new Board();
    for (const a of actions) if (board.validate(a).ok) board.apply(a);
    return board;
  }
}
