import { Action, BoardEditRequest, type Event } from "@mento/contracts";
import { Board } from "./board";
import type { CatalogEntry } from "./prompt-builder";

/** What the server remembers about one session between turns (rebuilt from events after a restart). */
export interface Runtime {
  board: Board;
  turnNo: number;
  verSeq: number;
  lastTopic: string;
  openVerification?: { verification_id: string; concept_key: string };
  /** The session's catalog (its subject's materials, or all), loaded once per session. */
  catalog?: CatalogEntry[];
  /** `edit_id`s of the student's board edits already stored (dedupe). */
  editIds: Set<string>;
}

export type StudentEditResult = "applied" | "already_applied" | "already_removed" | "element_not_found";

/**
 * Check and apply one student board edit to the runtime (plan F, D79). Only "applied" must be stored: a repeated
 * `edit_id` is "already_applied", an element already deleted is "already_removed", an id never seen is "element_not_found".
 */
export function applyStudentEdit(rt: Runtime, edit: BoardEditRequest): StudentEditResult {
  if (rt.editIds.has(edit.edit_id)) return "already_applied";
  const check = rt.board.checkEdit(edit);
  if (check === "not_found") return "element_not_found";
  if (check === "already_removed") return "already_removed";
  rt.board.applyEdit(edit);
  rt.editIds.add(edit.edit_id);
  return "applied";
}

/** The stored event of an applied edit (contracts-spec §18). */
export function studentEditEvent(edit: BoardEditRequest): { type: "board_element_removed" | "board_element_moved"; payload: unknown } {
  return edit.op === "remove"
    ? { type: "board_element_removed", payload: { element_id: edit.element_id, edit_id: edit.edit_id } }
    : { type: "board_element_moved", payload: { element_id: edit.element_id, column: edit.column, after_id: edit.after_id, edit_id: edit.edit_id } };
}

export function restoreRuntime(events: Event[]): Runtime {
  const rt: Runtime = { board: new Board(), turnNo: 0, verSeq: 0, lastTopic: "", editIds: new Set() };
  for (const e of events) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    if (e.type === "tutor_action") {
      const m = /^turn_(\d+)$/.exec(String(p.turn_id ?? ""));
      if (m) rt.turnNo = Math.max(rt.turnNo, Number(m[1]));
      const parsed = Action.safeParse({ id: p.action_id, name: p.name, args: p.args });
      if (parsed.success && rt.board.validate(parsed.data).ok) {
        rt.board.apply(parsed.data);
        if (parsed.data.name === "write_text") rt.lastTopic = (rt.board.get(parsed.data.args.id)?.text ?? "").slice(0, 80);
      }
    } else if (e.type === "verification_asked") {
      rt.verSeq += 1;
      rt.openVerification = { verification_id: String(p.verification_id), concept_key: String(p.concept_key) };
    } else if (e.type === "verification_answered" && rt.openVerification?.verification_id === p.verification_id) {
      rt.openVerification = undefined;
    } else if (e.type === "board_element_removed" || e.type === "board_element_moved") {
      // The student's edits, in event order with the tutor actions they refer to.
      const parsed = BoardEditRequest.safeParse({ ...p, op: e.type === "board_element_removed" ? "remove" : "move" });
      if (parsed.success) applyStudentEdit(rt, parsed.data);
    }
  }
  return rt;
}

/** Runs async tasks strictly in order (event persistence keeps the order of the conversation). */
export class OrderedQueue {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly onError: (err: unknown) => void) {}

  enqueue(task: () => Promise<unknown>): void {
    this.tail = this.tail.then(task).then(() => undefined, this.onError);
  }

  flush(): Promise<void> {
    return this.tail;
  }
}
