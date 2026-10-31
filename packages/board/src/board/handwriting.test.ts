// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Action } from "@mento/contracts";
import { applyActions, createBoardStore, emptyBoard } from "../store";
import { createActionQueue } from "../queue";
import {
  MAX_WRITE_MS,
  MIN_WRITE_MS,
  collectGlyphs,
  createWriteQueue,
  cubicBezier,
  groupLines,
  planJobs,
  revealClip,
  sharedPrefix,
  textGlyphs,
  writeDuration,
  writeSchedule,
} from "./handwriting";

const dom = (html: string): HTMLElement => {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
};

const write = (id: string, html: string): Action => ({
  id: `w_${id}`,
  name: "write_text",
  args: { id, column: "main", html },
});

describe("collectGlyphs", () => {
  it("lists graphemes in reading order across nested tags, skipping whitespace", () => {
    const glyphs = collectGlyphs(dom("<h1>Olá <b>Ro</b>ma</h1><ul><li>a <i>ç</i></li></ul>"));
    expect(glyphs.map((g) => g.text).join("")).toBe("OláRomaaç");
    expect(glyphs.filter((g) => g.wordStart).map((g) => g.text)).toEqual(["O", "R", "a", "ç"]);
    // "Ro" inside <b> and "ma" after it are one word: no word start at the tag boundary.
    expect(glyphs.find((g) => g.text === "m")?.wordStart).toBe(false);
  });

  it("keeps a letter and its combining accent as one glyph, with offsets into the text node", () => {
    const glyphs = collectGlyphs(dom("<p>é x</p>"));
    expect(glyphs.map((g) => g.text)).toEqual(["é", "x"]);
    expect(glyphs[0]).toMatchObject({ start: 0, end: 2 });
    expect(glyphs[1]).toMatchObject({ start: 3, end: 4 });
  });

  it("writes math text cleanly: superscripts, fractions and operators are glyphs", () => {
    const glyphs = collectGlyphs(dom("<p>x² + 3 = 7</p><p>½ de <span>H₂O</span></p>"));
    expect(glyphs.map((g) => g.text)).toEqual([
      "x",
      "²",
      "+",
      "3",
      "=",
      "7",
      "½",
      "d",
      "e",
      "H",
      "₂",
      "O",
    ]);
  });
});

describe("writeSchedule", () => {
  const items = (n: number, lineEvery = 0) =>
    Array.from({ length: n }, (_, i) => ({
      lineStart: lineEvery > 0 && i > 0 && i % lineEvery === 0,
      wordStart: i % 5 === 0,
    }));

  it("writes at ~45 chars/s within the per-element bounds", () => {
    expect(writeDuration(0)).toBe(0);
    expect(writeDuration(5)).toBe(MIN_WRITE_MS);
    expect(writeDuration(90)).toBeCloseTo(2000);
    expect(writeDuration(1000)).toBe(MAX_WRITE_MS);
    const slots = writeSchedule(items(90));
    expect(slots.at(-1)?.end).toBeCloseTo(2000);
  });

  it("is ordered, deterministic and never longer than the cap, even with many lines", () => {
    for (const [n, every] of [
      [40, 10],
      [400, 30],
      [1500, 40],
    ] as const) {
      const slots = writeSchedule(items(n, every), 7);
      expect(slots).toEqual(writeSchedule(items(n, every), 7));
      expect(slots.at(-1)?.end ?? 0).toBeLessThanOrEqual(MAX_WRITE_MS + 1e-6);
      for (let i = 1; i < slots.length; i++)
        expect(slots[i]!.start).toBeGreaterThanOrEqual(slots[i - 1]!.end - 1e-9);
    }
  });

  it("adds a pen arc before each new line", () => {
    const slots = writeSchedule(items(20, 10));
    expect(slots[10]!.start - slots[9]!.end).toBeGreaterThan(100);
    expect(slots[5]!.start).toBe(slots[4]!.end);
  });
});

describe("planJobs", () => {
  it("writes new tutor text, then its circles and highlights, in order", () => {
    const prev = emptyBoard();
    const next = applyActions(prev, [
      write("t", "<p>Em 27 a.C.</p>"),
      {
        id: "c1",
        name: "circle_annotate",
        args: { target_id: "t", text_to_match: "27 a.C.", color: "red" },
      },
      { id: "h1", name: "highlight", args: { target_id: "t", color: "yellow" } },
    ]);
    expect(planJobs(prev, next)).toEqual([
      { kind: "write", id: "t", from: null },
      { kind: "circle", id: "t", action_id: "c1" },
      { kind: "mark", id: "t", action_id: "h1" },
    ]);
  });

  it("skips replayed (instant) changes, drawings and unchanged elements", () => {
    const prev = applyActions(emptyBoard(), [write("t", "<p>a</p>")]);
    const next = applyActions(prev, [
      {
        id: "d",
        name: "draw",
        args: {
          id: "img",
          column: "visuals",
          prompt: "x",
          is_structured: false,
          max_dimensions: { w: 10, h: 10 },
        },
      },
    ]);
    expect(planJobs(prev, next)).toEqual([]);
    expect(planJobs(emptyBoard(), prev, { instant: true })).toEqual([]);
  });

  it("an update keeps the previous element so its unchanged text is not rewritten", () => {
    const prev = applyActions(emptyBoard(), [write("t", "<p>Roma</p>")]);
    const next = applyActions(prev, [
      { id: "u", name: "update_element", args: { id: "t", html: "<p>Roma antiga</p>" } },
    ]);
    expect(planJobs(prev, next)).toEqual([
      { kind: "write", id: "t", from: prev.elements.get("t") },
    ]);
    expect(sharedPrefix(textGlyphs("Roma"), textGlyphs("Roma antiga"))).toBe(4);
  });
});

describe("createWriteQueue", () => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("runs jobs one at a time in push order, completing each", async () => {
    const log: string[] = [];
    const runs = new Map<string, ReturnType<typeof deferred>>();
    const busy: boolean[] = [];
    const q = createWriteQueue<string>({
      run: (job) => {
        log.push(`run ${job}`);
        const d = deferred();
        runs.set(job, d);
        return d.promise;
      },
      complete: (job) => log.push(`done ${job}`),
      onBusyChange: (b) => busy.push(b),
    });
    q.push("a");
    q.push("b");
    q.push("c");
    expect(log).toEqual(["run a"]);
    runs.get("a")!.resolve();
    await tick();
    expect(log).toEqual(["run a", "done a", "run b"]);
    // Interrupt: the running job ends now and the queued ones complete without running.
    q.flush();
    expect(log).toEqual(["run a", "done a", "run b", "done b", "done c"]);
    expect(q.busy()).toBe(false);
    expect(busy).toEqual([true, false]);
    runs.get("b")!.resolve();
    await tick();
    expect(log.filter((l) => l === "done b")).toHaveLength(1);
  });
});

describe("store and queue hooks", () => {
  it("restore (instant) commits are flagged to listeners", () => {
    const store = createBoardStore();
    const seen: boolean[] = [];
    store.subscribe(() => seen.push(store.isInstant()));
    store.instant(() => store.dispatch(write("a", "<p>a</p>")));
    store.dispatch(write("b", "<p>b</p>"));
    expect(seen).toEqual([true, false]);
  });

  it("interrupt settles the board's writing; pause and resume reach it", () => {
    const store = createBoardStore();
    const signals: string[] = [];
    store.animation.subscribe((s) => signals.push(s));
    const queue = createActionQueue({ store });
    queue.beginTurn();
    queue.pause();
    queue.resume();
    queue.interrupt();
    expect(signals).toEqual(["settle", "pause", "resume", "settle"]);
  });

  it("the turn ends only after the board has finished writing", async () => {
    const store = createBoardStore();
    const states: string[] = [];
    const queue = createActionQueue({ store, onStateChange: (s) => states.push(s) });
    store.animation.setBusy(true);
    queue.beginTurn();
    queue.push({ type: "action", order: 0, action: write("a", "<p>a</p>") });
    queue.push({ type: "turn_done", turn_id: "t1" });
    await new Promise((r) => setTimeout(r, 0));
    expect(queue.getState()).toBe("playing");
    store.animation.setBusy(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(queue.getState()).toBe("idle");
  });
});

describe("geometry", () => {
  it("groups rects into lines and builds a staircase clip", () => {
    const { lines, lineOf } = groupLines([
      { top: 0, bottom: 30, left: 0, right: 10 },
      { top: 2, bottom: 28, left: 10, right: 20 },
      { top: 34, bottom: 64, left: 0, right: 10 },
    ]);
    expect(lineOf).toEqual([0, 0, 1]);
    expect(lines).toHaveLength(2);
    expect(revealClip([0, 32, 70], 1, 15, 100)).toBe(
      "polygon(-64.0px -64.0px, 164.0px -64.0px, 164.0px 32.0px, 15.0px 32.0px, 15.0px 70.0px, -64.0px 70.0px)",
    );
  });

  it("cubicBezier matches its end points and is monotonic", () => {
    const ease = cubicBezier(0.45, 0, 0.25, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.25)).toBeLessThan(ease(0.5));
  });
});
