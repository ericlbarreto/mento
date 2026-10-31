import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Action } from "@mento/contracts";
import { applyActions, emptyBoard, type ElementState } from "../../store";
import { editPermissions, isSamePlace, pickColumn, slotAt, slotLabel, stepTarget } from "./model";
import { UNDO_MS, createEditOutbox } from "./outbox";

let n = 0;
const text = (id: string, column: "main" | "visuals" | "side" = "main"): Action => ({
  id: `a${++n}`,
  name: "write_text",
  args: { id, column, html: `<p>${id}</p>` },
});
const state = applyActions(emptyBoard(), [text("a"), text("b"), text("c"), text("n", "side")]);
const el = (patch: Partial<ElementState>) =>
  ({ ...state.elements.get("a")!, ...patch }) as ElementState;

describe("editPermissions", () => {
  const free = { writing: false, locked: false, openQuestionId: null };
  it("allows both on a finished block, nothing while written or from the playing turn", () => {
    expect(editPermissions(el({}), free)).toEqual({ move: true, remove: true });
    expect(editPermissions(el({}), { ...free, writing: true })).toEqual({
      move: false,
      remove: false,
    });
    expect(editPermissions(el({}), { ...free, locked: true })).toEqual({
      move: false,
      remove: false,
    });
  });
  it("an unanswered question and an image placeholder move but are not deletable", () => {
    const q = el({ id: "q", type: "question" } as Partial<ElementState>);
    expect(editPermissions(q, { ...free, openQuestionId: "q" })).toEqual({
      move: true,
      remove: false,
    });
    expect(editPermissions(q, free)).toEqual({ move: true, remove: true });
    expect(
      editPermissions(el({ type: "image", status: "placeholder" } as Partial<ElementState>), free),
    ).toEqual({ move: true, remove: false });
  });
});

describe("drop slots", () => {
  const spans = [
    { id: "a", top: 0, bottom: 100 },
    { id: "b", top: 120, bottom: 200 },
  ];
  it("switches at the neighbour's midpoint", () => {
    expect(slotAt(10, spans)).toBeNull();
    expect(slotAt(51, spans)).toBe("a");
    expect(slotAt(159, spans)).toBe("a");
    expect(slotAt(161, spans)).toBe("b");
    expect(slotAt(10, [])).toBeNull();
  });
  it("changes column only 30 % into it", () => {
    const cols = [
      { column: "main" as const, left: 0, right: 680 },
      { column: "visuals" as const, left: 720, right: 1280 },
    ];
    expect(pickColumn("main", 700, cols)).toBe("main");
    expect(pickColumn("main", 800, cols)).toBe("main");
    expect(pickColumn("main", 900, cols)).toBe("visuals");
    expect(pickColumn("visuals", 600, cols)).toBe("visuals");
    expect(pickColumn("visuals", 400, cols)).toBe("main");
  });
  it("knows a drop in the same place", () => {
    expect(isSamePlace(state, "b", { column: "main", after_id: "a" })).toBe(true);
    expect(isSamePlace(state, "b", { column: "main", after_id: null })).toBe(false);
    expect(isSamePlace(state, "b", { column: "side", after_id: "a" })).toBe(false);
  });
});

describe("keyboard move mode", () => {
  it("steps up and down inside the column", () => {
    let t = { column: "main" as const, after_id: "a" as string | null };
    t = stepTarget(state, "b", t, "ArrowUp") as typeof t;
    expect(t).toEqual({ column: "main", after_id: null });
    expect(stepTarget(state, "b", t, "ArrowUp")).toEqual(t);
    t = stepTarget(state, "b", t, "ArrowDown") as typeof t;
    expect(t.after_id).toBe("a");
    t = stepTarget(state, "b", t, "ArrowDown") as typeof t;
    expect(t.after_id).toBe("c");
    expect(stepTarget(state, "b", t, "ArrowDown")).toEqual(t);
    expect(slotLabel(state, "b", t)).toEqual({ position: 3, total: 3 });
  });
  it("←/→ go to the neighbouring column (inert when columns are off)", () => {
    const t = { column: "main" as const, after_id: "a" };
    expect(stepTarget(state, "b", t, "ArrowLeft")).toEqual(t);
    expect(stepTarget(state, "b", t, "ArrowRight")).toEqual({ column: "visuals", after_id: null });
    expect(stepTarget(state, "b", { column: "visuals", after_id: null }, "ArrowRight")).toEqual({
      column: "side",
      after_id: null,
    });
    expect(stepTarget(state, "b", t, "ArrowRight", false)).toEqual(t);
  });
});

describe("edit outbox", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const removed = { element: state.elements.get("b")!, after_id: "a" };
  const remove = (id = "b") => ({ op: "remove" as const, edit_id: `e_${id}`, element_id: id });

  it("sends a held delete only when the undo window closes", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const box = createEditOutbox({ send });
    box.hold(remove(), removed);
    await vi.advanceTimersByTimeAsync(UNDO_MS - 1);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledWith(remove(), {});
    expect(box.held()).toBeNull();
  });

  it("undo within the window never sends", async () => {
    const send = vi.fn().mockResolvedValue({});
    const box = createEditOutbox({ send });
    box.hold(remove(), removed);
    await vi.advanceTimersByTimeAsync(3000);
    expect(box.undo()).toBe(removed);
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    expect(send).not.toHaveBeenCalled();
    expect(box.undo()).toBeNull();
  });

  it("hover pauses the window; a new delete sends the previous one", async () => {
    const send = vi.fn().mockResolvedValue({});
    const box = createEditOutbox({ send });
    box.hold(remove(), removed);
    await vi.advanceTimersByTimeAsync(2000);
    box.pauseTimer();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(send).not.toHaveBeenCalled();
    box.resumeTimer();
    await vi.advanceTimersByTimeAsync(UNDO_MS - 2000);
    expect(send).toHaveBeenCalledOnce();
    box.hold(remove("c"), removed);
    box.hold(remove("a"), removed);
    await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls.map((c) => c[0].element_id)).toEqual(["b", "c"]);
  });

  it("flush sends now (keepalive on pagehide) and waits for edits in flight; null when idle", async () => {
    let done!: () => void;
    const send = vi.fn().mockImplementation(() => new Promise<void>((r) => (done = r)));
    const box = createEditOutbox({ send });
    expect(box.flush()).toBeNull();
    box.hold(remove(), removed);
    const p = box.flush({ keepalive: true });
    expect(p).not.toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledWith(remove(), { keepalive: true });
    let settled = false;
    void p!.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    done();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
  });

  it("reports a failed send without throwing", async () => {
    const onError = vi.fn();
    const box = createEditOutbox({ send: () => Promise.reject(new Error("offline")), onError });
    box.send({ op: "move", edit_id: "m1", element_id: "a", column: "side", after_id: null });
    await box.flush();
    expect(onError).toHaveBeenCalledOnce();
  });
});
