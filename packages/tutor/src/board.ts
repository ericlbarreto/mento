import { Column, diagramLabels, type Action } from "@mento/contracts";

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

/** A student's board edit (plan F, D79): delete an element, or move it to a column right after `after_id` (null = top). */
export type BoardEdit =
  | { op: "remove"; element_id: string }
  | { op: "move"; element_id: string; column: string; after_id: string | null };

/** `not_found`: the id never existed in the session; `already_removed`: deleted (by the student or the tutor). */
export type EditCheck = "ok" | "already_removed" | "not_found";

const COLUMNS: readonly string[] = Column.options;
/** At most this many deleted ids are listed in the snapshot. */
const MAX_REMOVED_LISTED = 10;
const DELETED = "deleted by the student; do not reference or re-create it";

/**
 * The board as the server knows it: rebuilt from `tutor_action` events and the student's edits, used to validate every
 * new action. Each column keeps its own order (the student can reorder it); ids the student deleted are tombstones.
 */
export class Board {
  private readonly elements = new Map<string, BoardElement>();
  private readonly order = new Map<string, string[]>();
  /** Ids the student deleted, with their type: never targeted or re-created. */
  private readonly removed = new Map<string, ElementType>();
  /** Every id ever created in the session (a student edit on any other id is a 404). */
  private readonly known = new Set<string>();

  has(id: string): boolean {
    return this.elements.has(id);
  }

  get(id: string): BoardElement | undefined {
    return this.elements.get(id);
  }

  /** True when the student deleted this id. */
  removedByStudent(id: string): boolean {
    return this.removed.has(id);
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
        if (this.removed.has(action.args.id)) return fail(`duplicate element id: ${action.args.id} (${DELETED})`);
        return this.elements.has(action.args.id) ? fail(`duplicate element id: ${action.args.id}`) : OK;
      case "highlight": {
        const target = this.target(action.args.target_id);
        if ("reason" in target) return target;
        if (action.args.shape_id) {
          const shape = this.hasShape(target.el, action.args.shape_id);
          if (!shape.ok) return shape;
        }
        if (action.args.text_to_match && !norm(target.el.text).includes(norm(action.args.text_to_match))) {
          return fail(`text_to_match not found in ${action.args.target_id}`);
        }
        return OK;
      }
      case "circle_annotate": {
        const target = this.target(action.args.target_id);
        if ("reason" in target) return target;
        if (action.args.shape_id) return this.hasShape(target.el, action.args.shape_id);
        return norm(target.el.text).includes(norm(action.args.text_to_match))
          ? OK
          : fail(`text_to_match not found in ${action.args.target_id}`);
      }
      case "update_element": {
        if (this.removed.has(action.args.id)) return fail(`${action.args.id}: ${DELETED}`);
        const target = this.elements.get(action.args.id);
        if (!target) return fail(`unknown element: ${action.args.id}`);
        return target.type === "text" ? OK : fail(`only text elements can be updated: ${action.args.id}`);
      }
      case "remove_element":
        if (this.removed.has(action.args.id)) return fail(`${action.args.id}: ${DELETED}`);
        return this.elements.has(action.args.id) ? OK : fail(`unknown element: ${action.args.id}`);
      case "move_element": {
        const target = this.target(action.args.id);
        if ("reason" in target) return target;
        const after = action.args.after_id;
        if (after === null) return OK;
        if (after === action.args.id) return fail(`after_id cannot be the element itself: ${after}`);
        if (this.removed.has(after)) return fail(`${after}: ${DELETED}`);
        return this.elements.get(after)?.column === action.args.column ? OK : fail(`after_id ${after} is not in column ${action.args.column}`);
      }
      case "draw_result":
        return fail("draw_result is server-only");
    }
  }

  private target(id: string): { el: BoardElement } | { ok: false; reason: string } {
    if (this.removed.has(id)) return { ok: false, reason: `${id}: ${DELETED}` };
    const el = this.elements.get(id);
    return el ? { el } : { ok: false, reason: `unknown target: ${id}` };
  }

  private hasShape(target: BoardElement, shape_id: string): Validation {
    if (!target.shapes) return fail(`${target.id} is not a diagram: shape_id needs a draw_diagram element`);
    return target.shapes.some((s) => s.id === shape_id) ? OK : fail(`unknown shape ${shape_id} in ${target.id}`);
  }

  private column(name: string): string[] {
    let ids = this.order.get(name);
    if (!ids) {
      ids = [];
      this.order.set(name, ids);
    }
    return ids;
  }

  private unlink(el: BoardElement): void {
    const ids = this.column(el.column);
    const i = ids.indexOf(el.id);
    if (i >= 0) ids.splice(i, 1);
  }

  apply(action: Action): void {
    const el = created(action);
    if (el) {
      const previous = this.elements.get(el.id);
      if (previous) this.unlink(previous);
      this.elements.set(el.id, el);
      this.known.add(el.id);
      // New tutor elements always go to the end of their column (after the student's arrangement).
      this.column(el.column).push(el.id);
    } else if (action.name === "update_element") {
      const target = this.elements.get(action.args.id);
      if (target) target.text = stripTags(action.args.html);
    } else if (action.name === "remove_element") {
      const target = this.elements.get(action.args.id);
      if (target) this.unlink(target);
      this.elements.delete(action.args.id);
    } else if (action.name === "move_element") {
      this.place(action.args.id, action.args.column, action.args.after_id);
    }
  }

  /** Whether a student edit can be applied (moves and removes both need the element on the board). */
  checkEdit(edit: BoardEdit): EditCheck {
    if (!this.known.has(edit.element_id)) return "not_found";
    return this.elements.has(edit.element_id) ? "ok" : "already_removed";
  }

  /** Apply a student edit (call `checkEdit` first; anything else is a no-op). An unknown `after_id` means the end of the column. */
  applyEdit(edit: BoardEdit): void {
    const el = this.elements.get(edit.element_id);
    if (!el) return;
    if (edit.op === "remove") {
      this.unlink(el);
      this.elements.delete(el.id);
      this.removed.set(el.id, el.type);
      return;
    }
    this.place(el.id, edit.column, edit.after_id);
  }

  /** Put an element in `column` right after `after_id` (null = top; not found in that column = end). */
  private place(id: string, column: string, after_id: string | null): void {
    const el = this.elements.get(id);
    if (!el) return;
    this.unlink(el);
    el.column = column;
    const ids = this.column(column);
    const i = after_id === null ? -1 : ids.indexOf(after_id);
    if (after_id !== null && i < 0) ids.push(id);
    else ids.splice(i + 1, 0, id);
  }

  /** Elements column by column (main, visuals, side), each in the student's order. */
  private ordered(): BoardElement[] {
    const names = [...COLUMNS, ...[...this.order.keys()].filter((c) => !COLUMNS.includes(c))];
    return names.flatMap((c) => (this.order.get(c) ?? []).flatMap((id) => this.elements.get(id) ?? []));
  }

  /**
   * One compact line per element: `id | type | column | text` (given to the model every turn), column by column in
   * the student's order. A diagram lists its shapes instead of its text: `shapes: bloco (rect "2 kg"), seta_f (arrow "F")`.
   * Ids the student deleted close the list in one neutral line.
   */
  snapshot(maxText = 120): string {
    const clip = (t: string) => (t.length > maxText ? `${t.slice(0, maxText - 1)}…` : t);
    const lines = this.ordered().map((e) => {
      if (!e.shapes) return `${e.id} | ${e.type} | ${e.column} | ${clip(e.text)}`;
      const shapes = e.shapes.map((s) => `${s.id} (${s.kind}${s.label ? ` "${s.label}"` : ""})`).join(", ");
      return `${e.id} | ${e.type} | ${e.column} | ${clip(e.text.split(" · ")[0] ?? "")} | shapes: ${shapes}`;
    });
    if (lines.length === 0) lines.push("(the board is empty)");
    if (this.removed.size > 0) {
      const all = [...this.removed.entries()];
      const listed = all.slice(-MAX_REMOVED_LISTED).map(([id, type]) => `${id} (${type})`);
      const more = all.length > MAX_REMOVED_LISTED ? ` and ${all.length - MAX_REMOVED_LISTED} more` : "";
      lines.push(`Removed by the student: ${listed.join(", ")}${more}`);
    }
    return lines.join("\n");
  }

  static fromActions(actions: Action[]): Board {
    const board = new Board();
    for (const a of actions) if (board.validate(a).ok) board.apply(a);
    return board;
  }
}
