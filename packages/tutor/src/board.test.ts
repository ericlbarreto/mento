import { describe, expect, it } from "vitest";
import type { Action } from "@mento/contracts";
import { Board } from "./board";

const writeText = (id: string, html: string, column: "main" | "visuals" | "side" = "main"): Action => ({ id: `act_${id}`, name: "write_text", args: { id, column, html } });
const timeline = (id: string): Action => ({
  id: `act_${id}`, name: "write_timeline",
  args: { id, column: "main", events: [{ date: "509 a.C.", label: "Início da República" }, { date: "27 a.C.", label: "Otávio vira Augusto" }] },
});

describe("Board.validate", () => {
  it("accepts a new element and rejects a duplicate id", () => {
    const board = new Board();
    const a = writeText("title", "<h1>Roma</h1>");
    expect(board.validate(a)).toEqual({ ok: true });
    board.apply(a);
    expect(board.validate(writeText("title", "<p>outro</p>"))).toMatchObject({ ok: false });
  });

  it("requires highlight and circle targets to exist, and the circled text to occur in them", () => {
    const board = new Board();
    board.apply(timeline("tl"));
    const highlight = (target_id: string): Action => ({ id: "h", name: "highlight", args: { target_id, color: "yellow" } });
    expect(board.validate(highlight("tl"))).toEqual({ ok: true });
    expect(board.validate(highlight("nope"))).toMatchObject({ ok: false });

    const circle = (text_to_match: string): Action => ({ id: "c", name: "circle_annotate", args: { target_id: "tl", text_to_match, color: "red" } });
    expect(board.validate(circle("27 a.C."))).toEqual({ ok: true });
    expect(board.validate(circle("27 A.C."))).toEqual({ ok: true }); // case-insensitive
    expect(board.validate(circle("476 d.C."))).toMatchObject({ ok: false });
  });

  it("only lets update_element change text elements, and remove_element needs an existing id", () => {
    const board = new Board();
    board.apply(writeText("nota", "<p>antes</p>"));
    board.apply(timeline("tl"));
    expect(board.validate({ id: "u", name: "update_element", args: { id: "nota", html: "<p>depois</p>" } })).toEqual({ ok: true });
    expect(board.validate({ id: "u", name: "update_element", args: { id: "tl", html: "<p>x</p>" } })).toMatchObject({ ok: false });
    expect(board.validate({ id: "r", name: "remove_element", args: { id: "ghost" } })).toMatchObject({ ok: false });
  });

  it("never accepts draw_result from the model", () => {
    const board = new Board();
    expect(board.validate({ id: "d", name: "draw_result", args: { element_id: "colosseum", url: "/x.jpg" } })).toMatchObject({ ok: false });
  });
});

describe("Board.apply, snapshot and fromActions", () => {
  it("updates and removes elements and lists them in a compact snapshot", () => {
    const board = new Board();
    board.apply(writeText("title", "<h1>Da República</h1>"));
    board.apply({ id: "d", name: "draw", args: { id: "colosseum", column: "visuals", prompt: "Coliseu", is_structured: false, max_dimensions: { w: 500, h: 400 } } });
    board.apply({ id: "u", name: "update_element", args: { id: "title", html: "<h1>Ao Império</h1>" } });
    expect(board.snapshot()).toBe("title | text | main | Ao Império\ncolosseum | image | visuals | Coliseu");
    board.apply({ id: "r", name: "remove_element", args: { id: "colosseum" } });
    expect(board.has("colosseum")).toBe(false);
    expect(new Board().snapshot()).toBe("(the board is empty)");
  });

  it("truncates long text in the snapshot and rebuilds from a list of actions, skipping invalid ones", () => {
    const long = "x".repeat(300);
    const board = Board.fromActions([writeText("a", `<p>${long}</p>`), { id: "h", name: "highlight", args: { target_id: "ghost", color: "pink" } }]);
    expect(board.has("a")).toBe(true);
    expect(board.snapshot(20)).toBe(`a | text | main | ${"x".repeat(19)}…`);
  });
});

describe("Board: diagrams", () => {
  const diagram = {
    id: "act_d",
    name: "draw_diagram" as const,
    args: {
      id: "forcas",
      column: "visuals" as const,
      title: "Forças no bloco",
      frame: "wide" as const,
      view: { w: 160, h: 100 },
      shapes: [
        { id: "bloco", kind: "rect" as const, x: 50, y: 40, w: 30, h: 20, angle: 0, fill: "soft" as const, color: "ink" as const, label: { text: "2 kg", x: 65, y: 50, size: "m" as const } },
        { id: "peso", kind: "arrow" as const, x1: 65, y1: 50, x2: 65, y2: 84, color: "blue" as const, label: { text: "P = 20 N", x: 78, y: 84, size: "m" as const } },
        { id: "chao", kind: "line" as const, x1: 10, y1: 60, x2: 150, y2: 60, dashed: false, ground: true, color: "ink" as const },
      ],
    },
  };

  it("lists shape ids and labels in the snapshot", () => {
    const board = Board.fromActions([diagram]);
    expect(board.snapshot()).toBe('forcas | diagram | visuals | Forças no bloco | shapes: bloco (rect "2 kg"), peso (arrow "P = 20 N"), chao (line)');
  });

  it("validates shape_id targets and label matches", () => {
    const board = Board.fromActions([diagram, writeText("t", "<p>Peso</p>")]);
    expect(board.validate({ id: "c", name: "circle_annotate", args: { target_id: "forcas", text_to_match: "P", color: "red", shape_id: "peso" } }).ok).toBe(true);
    expect(board.validate({ id: "c", name: "circle_annotate", args: { target_id: "forcas", text_to_match: "P", color: "red", shape_id: "normal" } })).toMatchObject({ ok: false, reason: "unknown shape normal in forcas" });
    expect(board.validate({ id: "c", name: "circle_annotate", args: { target_id: "forcas", text_to_match: "20 N", color: "red" } }).ok).toBe(true);
    expect(board.validate({ id: "h", name: "highlight", args: { target_id: "forcas", color: "yellow", shape_id: "bloco" } }).ok).toBe(true);
    expect(board.validate({ id: "h", name: "highlight", args: { target_id: "t", color: "yellow", shape_id: "bloco" } })).toMatchObject({ ok: false });
    expect(board.validate(diagram)).toMatchObject({ ok: false, reason: "duplicate element id: forcas" });
    expect(board.validate({ id: "u", name: "update_element", args: { id: "forcas", html: "<p>x</p>" } }).ok).toBe(false);
  });
});

describe("Board: student edits (plan F)", () => {
  const board3 = () => Board.fromActions([writeText("a", "<p>A</p>"), writeText("b", "<p>B</p>"), writeText("c", "<p>C</p>"), writeText("n", "<p>N</p>", "side")]);
  const ids = (b: Board) => b.snapshot().split("\n").map((l) => l.split(" | ")[0]);

  it("moves an element after an anchor, to the top with null, and to the end of the column for an unknown anchor", () => {
    const board = board3();
    board.applyEdit({ op: "move", element_id: "c", column: "main", after_id: "a" });
    expect(ids(board)).toEqual(["a", "c", "b", "n"]);
    board.applyEdit({ op: "move", element_id: "b", column: "main", after_id: null });
    expect(ids(board)).toEqual(["b", "a", "c", "n"]);
    board.applyEdit({ op: "move", element_id: "b", column: "side", after_id: "ghost" });
    expect(board.snapshot()).toBe("a | text | main | A\nc | text | main | C\nn | text | side | N\nb | text | side | B");
  });

  it("appends new tutor elements at the end of their column, after the student's order", () => {
    const board = board3();
    board.applyEdit({ op: "move", element_id: "c", column: "main", after_id: null });
    board.apply(writeText("d", "<p>D</p>"));
    expect(ids(board)).toEqual(["c", "a", "b", "d", "n"]);
  });

  it("keeps a tombstone for a deleted id: actions on it fail, its id cannot be reused, the snapshot names it", () => {
    const board = board3();
    expect(board.checkEdit({ op: "remove", element_id: "b" })).toBe("ok");
    board.applyEdit({ op: "remove", element_id: "b" });
    expect(board.has("b")).toBe(false);
    expect(board.removedByStudent("b")).toBe(true);
    expect(board.snapshot()).toBe("a | text | main | A\nc | text | main | C\nn | text | side | N\nRemoved by the student: b (text)");

    const deleted = "deleted by the student; do not reference or re-create it";
    expect(board.validate({ id: "h", name: "highlight", args: { target_id: "b", color: "yellow" } })).toEqual({ ok: false, reason: `b: ${deleted}` });
    expect(board.validate({ id: "c", name: "circle_annotate", args: { target_id: "b", text_to_match: "B", color: "red" } })).toEqual({ ok: false, reason: `b: ${deleted}` });
    expect(board.validate({ id: "u", name: "update_element", args: { id: "b", html: "<p>x</p>" } })).toEqual({ ok: false, reason: `b: ${deleted}` });
    expect(board.validate({ id: "r", name: "remove_element", args: { id: "b" } })).toEqual({ ok: false, reason: `b: ${deleted}` });
    expect(board.validate(writeText("b", "<p>de novo</p>"))).toEqual({ ok: false, reason: `duplicate element id: b (${deleted})` });
  });

  it("tells a never-seen id from one already removed (by the student or the tutor)", () => {
    const board = board3();
    board.applyEdit({ op: "remove", element_id: "a" });
    board.apply({ id: "r", name: "remove_element", args: { id: "c" } });
    expect(board.checkEdit({ op: "remove", element_id: "ghost" })).toBe("not_found");
    expect(board.checkEdit({ op: "remove", element_id: "a" })).toBe("already_removed");
    expect(board.checkEdit({ op: "move", element_id: "c", column: "main", after_id: null })).toBe("already_removed");
    expect(board.checkEdit({ op: "move", element_id: "b", column: "main", after_id: null })).toBe("ok");
  });

  it("caps the removed list in the snapshot and still shows it on an empty board", () => {
    const board = Board.fromActions(Array.from({ length: 12 }, (_, i) => writeText(`t${i}`, `<p>${i}</p>`)));
    for (let i = 0; i < 12; i++) board.applyEdit({ op: "remove", element_id: `t${i}` });
    const lines = board.snapshot().split("\n");
    expect(lines[0]).toBe("(the board is empty)");
    expect(lines[1]).toMatch(/^Removed by the student: t2 \(text\), .*t11 \(text\) and 2 more$/);
  });
});

describe("Board: the tutor tidies and marks passages", () => {
  const move = (id: string, column: "main" | "visuals" | "side", after_id: string | null): Action => ({ id: `mv_${id}`, name: "move_element", args: { id, column, after_id } });

  it("validates move_element: the target exists and is not deleted, after_id is null or in the target column", () => {
    const board = Board.fromActions([writeText("a", "<p>A</p>"), writeText("b", "<p>B</p>"), writeText("n", "<p>N</p>", "side")]);
    expect(board.validate(move("b", "main", null))).toEqual({ ok: true });
    expect(board.validate(move("b", "side", "n"))).toEqual({ ok: true });
    expect(board.validate(move("b", "side", "a"))).toMatchObject({ ok: false });
    expect(board.validate(move("b", "main", "b"))).toMatchObject({ ok: false });
    expect(board.validate(move("ghost", "main", null))).toMatchObject({ ok: false });
    board.applyEdit({ op: "remove", element_id: "a" });
    expect(board.validate(move("a", "main", null))).toMatchObject({ ok: false, reason: expect.stringContaining("deleted by the student") });
    expect(board.validate(move("b", "main", "a"))).toMatchObject({ ok: false, reason: expect.stringContaining("deleted by the student") });
  });

  it("applies move_element in the column order (and from stored actions)", () => {
    const board = Board.fromActions([writeText("a", "<p>A</p>"), writeText("b", "<p>B</p>"), writeText("c", "<p>C</p>"), move("c", "main", "a"), move("a", "side", null)]);
    expect(board.snapshot()).toBe("c | text | main | C\nb | text | main | B\na | text | side | A");
  });

  it("highlight text_to_match must occur in the target's text", () => {
    const board = Board.fromActions([writeText("t", "<p>O Senado tinha medo</p>")]);
    const hl = (text_to_match: string): Action => ({ id: "h", name: "highlight", args: { target_id: "t", color: "blue", text_to_match } });
    expect(board.validate(hl("o senado"))).toEqual({ ok: true });
    expect(board.validate(hl("o povo"))).toMatchObject({ ok: false, reason: "text_to_match not found in t" });
  });
});
