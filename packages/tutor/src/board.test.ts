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
