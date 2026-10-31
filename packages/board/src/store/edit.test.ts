import { describe, expect, it, vi } from "vitest";
import type { Action } from "@mento/contracts";
import { anchorOf, applyAction, applyActions, applyEdit, restoreRemoved } from "./reducer";
import { createBoardStore } from "./store";
import { type BoardAction, emptyBoard } from "./types";
import { defaultHandlers } from "../queue";

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

describe("tutor move_element", () => {
  const move = (id: string, column: "main" | "visuals" | "side", after_id: string | null): BoardAction => ({ id: `a${++n}`, name: "move_element", args: { id, column, after_id } });

  it("moves like the student's edit, and is dropped on a deleted id", () => {
    const onWarning = vi.fn();
    expect(applyAction(board(), move("c", "main", null)).columns.main).toEqual(["c", "a", "b"]);
    expect(applyAction(board(), move("a", "side", "n")).columns.side).toEqual(["n", "a"]);
    const s = applyEdit(board(), { op: "remove", element_id: "a" });
    expect(applyAction(s, move("a", "main", null), { onWarning })).toBe(s);
    expect(onWarning).toHaveBeenCalledOnce();
  });

  it("has a default handler (played like any board action)", () => {
    expect((defaultHandlers as Record<string, unknown>).move_element).toBeTypeOf("function");
  });

  it("announces live layout changes before the commit, never during a restore", () => {
    const store = createBoardStore({ initial: board() });
    const seen: string[] = [];
    store.subscribeLayout((c) => seen.push(`${c.by}:${c.kind}:${c.id}:${store.getColumn("main").join(",")}`));
    store.dispatch(move("c", "main", null));
    store.dispatch({ id: "r1", name: "remove_element", args: { id: "b" } });
    store.applyEdit({ op: "move", element_id: "a", column: "main", after_id: "a" }); // no change: silent
    store.instant(() => store.dispatch(move("a", "main", null)));
    const el = store.getElement("c")!;
    store.applyEdit({ op: "remove", element_id: "c" });
    store.restoreRemoved({ element: el, after_id: null });
    expect(seen).toEqual([
      "tutor:move:c:a,b,c",
      "tutor:remove:b:c,a,b",
      "student:remove:c:a,c",
      "student:restore:c:a",
    ]);
  });
});

describe("free positioning (plan G)", () => {
  const place = (target: string, next_to: string, side: "right" | "left" | "below" | "above"): Action => ({ id: `a${++n}`, name: "place_element", args: { id: target, next_to, side } });

  it("place pins the element out of its column; a later move puts it back", () => {
    let s = applyEdit(board(), { op: "place", element_id: "b", x: 224.4, y: 263.6 });
    expect(s.columns.main).toEqual(["a", "c"]);
    expect(s.free).toEqual(["b"]);
    expect(s.elements.get("b")?.pos).toEqual({ x: 224, y: 264 });
    s = applyEdit(s, { op: "move", element_id: "b", column: "main", after_id: "a" });
    expect(s.columns.main).toEqual(["a", "b", "c"]);
    expect(s.free).toEqual([]);
    expect(s.elements.get("b")?.pos).toBeUndefined();
  });

  it("the tutor attaches a block beside another one, wherever that one is; no chains", () => {
    const onWarning = vi.fn();
    let s = applyActions(board(), [place("c", "a", "right")]);
    expect(s.columns.main).toEqual(["a", "b"]);
    expect(s.attached).toEqual(["c"]);
    expect(s.elements.get("c")?.near).toEqual({ id: "a", side: "right" });
    s = applyActions(s, [place("n", "c", "below")], { onWarning });
    expect(onWarning.mock.calls[0]?.[0]).toMatch(/no chains/);
    // Moving the host keeps its attachment.
    s = applyEdit(s, { op: "place", element_id: "a", x: 400, y: 80 });
    expect(s.elements.get("c")?.near?.id).toBe("a");
  });

  it("deleting a host sends its attached blocks back to their column; undo pins a pinned block again", () => {
    let s = applyActions(board(), [place("n", "a", "below")]);
    s = applyEdit(s, { op: "place", element_id: "a", x: 96, y: 40 });
    const removed = { element: s.elements.get("a")!, after_id: null };
    s = applyEdit(s, { op: "remove", element_id: "a" });
    expect(s.attached).toEqual([]);
    expect(s.columns.side).toEqual(["n"]);
    expect(s.elements.get("n")?.near).toBeUndefined();
    s = restoreRemoved(s, removed);
    expect(s.free).toEqual(["a"]);
  });

  it("a replaced id keeps its spot", () => {
    let s = applyEdit(board(), { op: "place", element_id: "b", x: 10, y: 10 });
    s = applyActions(s, [text("b")]);
    expect(s.elements.get("b")?.pos).toEqual({ x: 10, y: 10 });
  });
});
