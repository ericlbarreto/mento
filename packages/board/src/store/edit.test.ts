import { describe, expect, it, vi } from "vitest";
import type { Action } from "@mento/contracts";
import { anchorOf, applyAction, applyActions, applyEdit, restoreRemoved } from "./reducer";
import { createBoardStore } from "./store";
import { emptyBoard } from "./types";

let n = 0;
const text = (id: string, column: "main" | "visuals" | "side" = "main"): Action => ({ id: `a${++n}`, name: "write_text", args: { id, column, html: `<p>${id}</p>` } });
const circle = (target_id: string): Action => ({ id: `a${++n}`, name: "circle_annotate", args: { target_id, text_to_match: "x", color: "red" } });
const draw = (id: string): Action => ({ id: `a${++n}`, name: "draw", args: { id, column: "visuals", prompt: "Coliseu", is_structured: false, max_dimensions: { w: 400, h: 300 } } });
const drawResult = (element_id: string): Action => ({ id: `a${++n}`, name: "draw_result", args: { element_id, url: "/api/gen/0123456789abcdef0123456789abcdef.jpg" } });

const board = () => applyActions(emptyBoard(), [text("a"), text("b"), text("c"), text("n", "side"), circle("b")]);

describe("applyEdit", () => {
  it("remove drops the element and its annotations and remembers the id", () => {
    const s = applyEdit(board(), { op: "remove", element_id: "b" });
    expect(s.columns.main).toEqual(["a", "c"]);
    expect(s.elements.has("b")).toBe(false);
    expect(s.removed.has("b")).toBe(true);
  });

  it("drops later tutor actions on a removed id, a late draw_result and a re-created id included", () => {
    const onWarning = vi.fn();
    let s = applyActions(emptyBoard(), [draw("img")]);
    s = applyEdit(s, { op: "remove", element_id: "img" });
    s = applyActions(s, [drawResult("img"), circle("img"), text("img")], { onWarning });
    expect(s.elements.has("img")).toBe(false);
    expect(s.columns.visuals).toEqual([]);
    expect(onWarning).toHaveBeenCalledTimes(3);
    expect(onWarning.mock.calls[0]?.[0]).toMatch(/deleted by the student/);
  });

  it("move places the element right after after_id, null = top", () => {
    expect(applyEdit(board(), { op: "move", element_id: "c", column: "main", after_id: null }).columns.main).toEqual(["c", "a", "b"]);
    expect(applyEdit(board(), { op: "move", element_id: "a", column: "main", after_id: "b" }).columns.main).toEqual(["b", "a", "c"]);
    expect(applyEdit(board(), { op: "move", element_id: "a", column: "main", after_id: "c" }).columns.main).toEqual(["b", "c", "a"]);
  });

  it("move to another column changes the element's column and keeps its annotations", () => {
    const s = applyEdit(board(), { op: "move", element_id: "b", column: "side", after_id: "n" });
    expect(s.columns.main).toEqual(["a", "c"]);
    expect(s.columns.side).toEqual(["n", "b"]);
    expect(s.elements.get("b")).toMatchObject({ column: "side", annotations: [{ kind: "circle" }] });
    // The tutor's next block still goes to the end of its own column.
    expect(applyAction(s, text("d")).columns.main).toEqual(["a", "c", "d"]);
  });

  it("a move to the same place keeps the same state; a missing anchor appends", () => {
    const s = board();
    expect(applyEdit(s, { op: "move", element_id: "b", column: "main", after_id: "a" })).toBe(s);
    expect(applyEdit(s, { op: "move", element_id: "a", column: "main", after_id: "gone" }).columns.main).toEqual(["b", "c", "a"]);
  });

  it("is a no-op on an unknown or already removed id", () => {
    const onWarning = vi.fn();
    const s = applyEdit(board(), { op: "remove", element_id: "b" });
    expect(applyEdit(s, { op: "remove", element_id: "b" }, { onWarning })).toBe(s);
    expect(onWarning).not.toHaveBeenCalled();
    expect(applyEdit(s, { op: "move", element_id: "zz", column: "main", after_id: null }, { onWarning })).toBe(s);
    expect(onWarning).toHaveBeenCalledOnce();
  });

  it("restoreRemoved puts the element back after its old neighbour and forgets the tombstone", () => {
    const s0 = board();
    const removed = { element: s0.elements.get("b")!, after_id: anchorOf(s0, "b") };
    expect(removed.after_id).toBe("a");
    const s = restoreRemoved(applyEdit(s0, { op: "remove", element_id: "b" }), removed);
    expect(s.columns.main).toEqual(["a", "b", "c"]);
    expect(s.removed.has("b")).toBe(false);
    expect(s.elements.get("b")?.annotations).toHaveLength(1);
    expect(anchorOf(s0, "a")).toBeNull();
  });
});

describe("store edits", () => {
  it("notify the touched columns and run as instant commits (no handwriting)", () => {
    const store = createBoardStore({ initial: board() });
    const main = vi.fn();
    const side = vi.fn();
    const instant: boolean[] = [];
    store.subscribeColumn("main", main);
    store.subscribeColumn("side", side);
    store.subscribe(() => instant.push(store.isInstant()));
    store.applyEdit({ op: "move", element_id: "a", column: "side", after_id: null });
    expect(main).toHaveBeenCalledOnce();
    expect(side).toHaveBeenCalledOnce();
    const el = store.getElement("c")!;
    store.applyEdit({ op: "remove", element_id: "c" });
    store.restoreRemoved({ element: el, after_id: "b" });
    expect(store.getColumn("main")).toEqual(["b", "c"]);
    expect(instant).toEqual([true, true, true]);
  });
});
