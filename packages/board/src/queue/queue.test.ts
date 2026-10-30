import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_TURNS } from "../mock";
import type { TurnStreamMessage } from "../protocol";
import { TextSpeechPlayer, readingTimeMs } from "../speech";
import { createBoardStore } from "../store";
import { createActionQueue } from "./queue";
import type { QueueState } from "./types";

const intro = FIXTURE_TURNS["rome-intro"];

function setup() {
  const warnings: string[] = [];
  const store = createBoardStore({ onWarning: (w) => warnings.push(w) });
  const speech = new TextSpeechPlayer();
  const states: QueueState[] = [];
  const captions: string[] = [];
  const queue = createActionQueue({
    store,
    speech,
    onStateChange: (s) => states.push(s),
    onCaption: (c) => captions.push(c.text),
    onWarning: (w) => warnings.push(w),
  });
  const ids = () => [...store.getState().elements.keys()];
  return { store, speech, queue, states, captions, warnings, ids };
}

/** Lets pending promise callbacks run without moving the clock. */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("action queue", () => {
  it("plays in order despite shuffled arrival", async () => {
    const t = setup();
    const [start, ...rest] = intro;
    const actions = rest.filter((m) => "action" in m);
    const doneMsg = rest.find((m) => "done" in m)!;
    const shuffled = [...actions].reverse(); // worst case: last first
    t.queue.beginTurn();
    t.queue.push(start!);
    for (const m of shuffled) t.queue.push(m);
    t.queue.push(doneMsg);
    await vi.runAllTimersAsync();
    expect(t.ids()).toEqual(["title", "colosseum", "timeline_rome", "el_republic_end", "el_q_republic_end"]);
    expect(t.store.getElement("colosseum")?.status).toBe("ready");
    expect(t.captions).toHaveLength(3);
    expect(t.warnings).toEqual([]);
  });

  it("speak gates the next action; draw does not block", async () => {
    const t = setup();
    const msgs = intro.slice(0, 6); // turn_id, write_text, highlight, speak, draw, write_timeline
    t.queue.beginTurn();
    expect(t.queue.getState()).toBe("thinking");
    for (const m of msgs) t.queue.push(m);
    await flush();
    expect(t.ids()).toEqual(["title"]); // speaking: the draw waits
    expect(t.queue.getState()).toBe("playing");
    const speak = msgs[3] as Extract<TurnStreamMessage, { order: number }>;
    if (speak.action.name !== "speak") throw new Error("fixture changed");
    await vi.advanceTimersByTimeAsync(readingTimeMs(speak.action.args.text) - 10);
    expect(t.ids()).toEqual(["title"]);
    await vi.advanceTimersByTimeAsync(20);
    // draw placeholder and the timeline land together: draw continued immediately
    expect(t.ids()).toEqual(["title", "colosseum", "timeline_rome"]);
    expect(t.store.getElement("colosseum")?.status).toBe("placeholder");
  });

  it("interrupt() clears pending synchronously, keeps the board and returns the payload", async () => {
    const t = setup();
    t.queue.beginTurn();
    for (const m of intro) t.queue.push(m);
    await flush();
    await vi.advanceTimersByTimeAsync(1500); // midway through the first speak
    const payload = t.queue.interrupt();
    expect(payload).toMatchObject({ turn_id: "turn_intro", action_id: "act_intro_3" });
    expect(payload?.spoken_chars).toBeGreaterThan(0);
    expect(t.queue.getState()).toBe("idle");
    const before = t.ids();
    expect(before).toEqual(["title"]);
    await vi.runAllTimersAsync();
    expect(t.ids()).toEqual(before); // nothing else plays
    expect(t.queue.interrupt()).toBeNull(); // nothing left to cut
  });

  it("pause() holds the script and resume() continues it", async () => {
    const t = setup();
    t.queue.beginTurn();
    for (const m of intro) t.queue.push(m);
    await flush();
    t.queue.pause();
    expect(t.queue.getState()).toBe("paused");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.ids()).toEqual(["title"]);
    t.queue.resume();
    expect(t.queue.getState()).toBe("playing");
    await vi.runAllTimersAsync();
    expect(t.ids()).toHaveLength(5);
  });

  it("ends in waiting_answer after ask_verification", async () => {
    const t = setup();
    t.queue.beginTurn();
    for (const m of intro) t.queue.push(m);
    await vi.runAllTimersAsync();
    expect(t.queue.getState()).toBe("waiting_answer");
    // draw_result was already buffered, so it plays right after the question: no flicker in between.
    expect(t.states).toEqual(["thinking", "playing", "waiting_answer"]);
  });

  it("ends idle after a turn without a question, and warns on duplicates and unknown targets", async () => {
    const t = setup();
    t.queue.beginTurn();
    const click = FIXTURE_TURNS["rome-click-27bc"]; // circles timeline_rome, absent on an empty board
    for (const m of click) t.queue.push(m);
    t.queue.push(click[1]!); // duplicate order 0
    await vi.runAllTimersAsync();
    expect(t.queue.getState()).toBe("idle");
    expect(t.ids()).toEqual(["el_side_27bc"]);
    expect(t.warnings.some((w) => w.includes("duplicate order 0"))).toBe(true);
    expect(t.warnings.some((w) => w.includes("timeline_rome"))).toBe(true);
  });

  it("applies streamed svg chunks on done when no draw_result came", async () => {
    const t = setup();
    t.queue.beginTurn();
    t.queue.push({ turn_id: "turn_svg" });
    t.queue.push({ order: 0, action: { id: "d", name: "draw", args: { id: "diag", column: "visuals", prompt: "p", is_structured: true, max_dimensions: { w: 100, h: 100 } } } });
    t.queue.push({ stream: "svg", element_id: "diag", chunk: '<svg viewBox="0 0 1 1">' });
    t.queue.push({ stream: "svg", element_id: "diag", chunk: "<rect></rect></svg>" });
    t.queue.push({ done: true });
    await vi.runAllTimersAsync();
    expect(t.store.getElement("diag")).toMatchObject({ type: "svg", status: "ready", data: { svg: '<svg viewBox="0 0 1 1"><rect></rect></svg>' } });
  });

  it("surfaces stream errors through onError", async () => {
    const onError = vi.fn();
    const queue = createActionQueue({ store: createBoardStore(), onError });
    queue.beginTurn();
    queue.push({ error: { message: "falhou" } });
    await vi.runAllTimersAsync();
    expect(onError).toHaveBeenCalledWith("falhou");
    expect(queue.getState()).toBe("idle");
  });
});
