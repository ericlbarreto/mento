import { describe, expect, it, vi } from "vitest";
import { FIXTURE_TURNS } from "../mock";
import type { TutorAction } from "../protocol";
import { applyAction, applyActions } from "./reducer";
import { createBoardStore } from "./store";
import { emptyBoard } from "./types";

const actionsOf = (name: keyof typeof FIXTURE_TURNS): TutorAction[] =>
  FIXTURE_TURNS[name].flatMap((m) => ("action" in m ? [m] : [])).sort((a, b) => a.order - b.order).map((m) => m.action);

const types = (s: ReturnType<typeof emptyBoard>) => [...s.elements.values()].map((e) => `${e.id}:${e.type}`);

describe("applyAction with the Rome fixtures", () => {
  it("builds the expected board, in order, without warnings", () => {
    const onWarning = vi.fn();
    let s = applyActions(emptyBoard(), actionsOf("rome-intro"), { onWarning, now: 1 });
    expect(types(s)).toEqual([
      "title:text",
      "colosseum:image",
      "timeline_rome:timeline",
      "el_republic_end:text",
      "el_q_republic_end:question",
    ]);
    expect(s.columns.main).toEqual(["title", "timeline_rome", "el_republic_end", "el_q_republic_end"]);
    expect(s.columns.visuals).toEqual(["colosseum"]);
    expect(s.elements.get("title")?.annotations).toEqual([{ kind: "highlight", color: "yellow", action_id: "act_intro_2" }]);
    expect(s.elements.get("timeline_rome")?.annotations[0]).toMatchObject({ kind: "circle", text_to_match: "27 a.C.", color: "red" });
    expect(s.elements.get("el_republic_end")?.sources?.[0]?.page).toBe(12);

    for (const name of ["rome-click-27bc", "rome-wrong-answer", "rome-outside-material"] as const) {
      s = applyActions(s, actionsOf(name), { onWarning });
    }
    expect(s.columns.side).toEqual(["el_side_27bc", "el_outside"]);
    expect(s.columns.main).toContain("el_reexplain");
    expect(s.elements.get("timeline_rome")?.annotations).toHaveLength(2);
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("draw inserts a placeholder that draw_result swaps to ready", () => {
    const intro = actionsOf("rome-intro");
    const draw = intro.find((a) => a.name === "draw")!;
    const result = intro.find((a) => a.name === "draw_result")!;
    const s1 = applyAction(emptyBoard(), draw);
    const placeholder = s1.elements.get("colosseum");
    expect(placeholder).toMatchObject({ type: "image", status: "placeholder", data: { max_dimensions: { w: 500, h: 400 } } });
    const s2 = applyAction(s1, result);
    expect(s2.elements.get("colosseum")).toMatchObject({ type: "image", status: "ready", data: { url: "/brand/mascot.png" } });

    const svg = applyAction(s1, { id: "a", name: "draw_result", args: { element_id: "colosseum", svg: "<svg></svg>" } });
    expect(svg.elements.get("colosseum")).toMatchObject({ type: "svg", status: "ready", data: { svg: "<svg></svg>" } });
  });

  it("updates and removes elements", () => {
    let s = applyAction(emptyBoard(), { id: "a1", name: "write_text", args: { id: "t", column: "side", html: "<p>a</p>" } });
    s = applyAction(s, { id: "a2", name: "update_element", args: { id: "t", html: "<p>b</p>" } });
    expect(s.elements.get("t")?.data).toEqual({ html: "<p>b</p>" });
    s = applyAction(s, { id: "a3", name: "remove_element", args: { id: "t" } });
    expect(s.elements.has("t")).toBe(false);
    expect(s.columns.side).toEqual([]);
  });

  it("warns (never throws) on unknown targets and leaves the board unchanged", () => {
    const onWarning = vi.fn();
    const s = emptyBoard();
    const bad: TutorAction[] = [
      { id: "b1", name: "highlight", args: { target_id: "nope", color: "yellow" } },
      { id: "b2", name: "circle_annotate", args: { target_id: "nope", text_to_match: "x", color: "red" } },
      { id: "b3", name: "update_element", args: { id: "nope", html: "<p>x</p>" } },
      { id: "b4", name: "remove_element", args: { id: "nope" } },
      { id: "b5", name: "draw_result", args: { element_id: "nope", url: "/x.png" } },
    ];
    for (const a of bad) expect(applyAction(s, a, { onWarning })).toBe(s);
    expect(onWarning).toHaveBeenCalledTimes(bad.length);
    expect(onWarning.mock.calls[0]?.[0]).toContain("nope");
  });
});

describe("createBoardStore subscriptions", () => {
  it("notifies only the element that changed", () => {
    const store = createBoardStore();
    store.dispatch({ id: "a1", name: "write_text", args: { id: "a", column: "main", html: "<p>a</p>" } });
    const onA = vi.fn();
    const onB = vi.fn();
    const onMain = vi.fn();
    const onAdded = vi.fn();
    store.subscribeElement("a", onA);
    store.subscribeElement("b", onB);
    store.subscribeColumn("main", onMain);
    store.subscribeAdded(onAdded);

    store.dispatch({ id: "a2", name: "write_text", args: { id: "b", column: "main", html: "<p>b</p>" } });
    expect(onA).not.toHaveBeenCalled();
    expect(onB).toHaveBeenCalledTimes(1);
    expect(onMain).toHaveBeenCalledTimes(1);
    expect(onAdded).toHaveBeenCalledWith("b");

    store.dispatch({ id: "a3", name: "highlight", args: { target_id: "a", color: "blue" } });
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onMain).toHaveBeenCalledTimes(1);
  });
});
