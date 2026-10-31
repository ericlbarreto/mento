import { describe, expect, it } from "vitest";
import type { Event } from "@mento/contracts";
import { OrderedQueue, applyStudentEdit, restoreRuntime } from "./turn-runtime";

const ev = (type: Event["type"], payload: unknown, n = 1): Event => ({ id: String(n), session_id: "s", ts: "2026-10-30T21:00:00.000Z", type, payload });
const action = (turn: number, name: string, args: unknown, id: string) => ev("tutor_action", { turn_id: `turn_${turn}`, action_id: id, order: 0, name, args });

describe("restoreRuntime", () => {
  it("rebuilds the board, turn counter, verification counter, last topic and open verification from events", () => {
    const rt = restoreRuntime([
      action(1, "write_text", { id: "title", column: "main", html: "<h1>Da República ao Império</h1>" }, "act_1_0"),
      action(2, "ask_verification", { id: "q1", column: "main", verification_id: "ver_1", concept: "Fim da República", concept_key: "fim da republica", question: "Por que mudou?", kind: "explain" }, "act_2_0"),
      ev("verification_asked", { verification_id: "ver_1", concept_key: "fim da republica" }),
    ]);
    expect(rt.turnNo).toBe(2);
    expect(rt.verSeq).toBe(1);
    expect(rt.board.has("title")).toBe(true);
    expect(rt.board.has("q1")).toBe(true);
    expect(rt.lastTopic).toBe("Da República ao Império");
    expect(rt.openVerification).toEqual({ verification_id: "ver_1", concept_key: "fim da republica" });
  });

  it("clears the open verification once it was answered and ignores invalid stored actions", () => {
    const rt = restoreRuntime([
      ev("verification_asked", { verification_id: "ver_1", concept_key: "x" }),
      ev("verification_answered", { verification_id: "ver_1", element_id: "q", answer: "a" }),
      action(1, "highlight", { target_id: "ghost", color: "yellow" }, "act_1_0"),
    ]);
    expect(rt.openVerification).toBeUndefined();
    expect(rt.turnNo).toBe(1);
  });
});

describe("student board edits in the runtime", () => {
  const text = (id: string, turn = 1) => action(turn, "write_text", { id, column: "main", html: `<p>${id}</p>` }, `act_${id}`);

  it("replays edits in event order with the tutor actions, and remembers their edit ids", () => {
    const rt = restoreRuntime([
      text("a"),
      text("b"),
      ev("board_element_moved", { element_id: "b", column: "main", after_id: null, edit_id: "e1" }),
      ev("board_element_removed", { element_id: "a", edit_id: "e2" }),
      text("c", 2),
      ev("board_element_moved", { element_id: "c", column: "side", after_id: "ghost", edit_id: "e3" }),
    ]);
    expect(rt.board.snapshot()).toBe("b | text | main | b\nc | text | side | c\nRemoved by the student: a (text)");
    expect([...rt.editIds]).toEqual(["e1", "e2", "e3"]);
  });

  it("answers applied, already_applied, already_removed and element_not_found", () => {
    const rt = restoreRuntime([text("a"), text("b")]);
    expect(applyStudentEdit(rt, { op: "remove", edit_id: "e1", element_id: "a" })).toBe("applied");
    expect(applyStudentEdit(rt, { op: "remove", edit_id: "e1", element_id: "a" })).toBe("already_applied");
    expect(applyStudentEdit(rt, { op: "remove", edit_id: "e2", element_id: "a" })).toBe("already_removed");
    expect(applyStudentEdit(rt, { op: "move", edit_id: "e3", element_id: "ghost", column: "main", after_id: null })).toBe("element_not_found");
    expect(applyStudentEdit(rt, { op: "move", edit_id: "e4", element_id: "b", column: "side", after_id: null })).toBe("applied");
    expect(rt.board.get("b")?.column).toBe("side");
  });
});

describe("OrderedQueue", () => {
  it("runs tasks one after another in order and reports failures without stopping", async () => {
    const seen: string[] = [];
    const errors: unknown[] = [];
    const q = new OrderedQueue((e) => errors.push(e));
    q.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 20));
      seen.push("a");
    });
    q.enqueue(async () => {
      throw new Error("boom");
    });
    q.enqueue(async () => {
      seen.push("c");
    });
    await q.flush();
    expect(seen).toEqual(["a", "c"]);
    expect(errors).toHaveLength(1);
  });
});
