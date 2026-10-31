import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_TURNS, type FixtureName } from "../mock";
import type { Action, SpeechPlayer, StreamMessage } from "@mento/contracts";
import { TextSpeechPlayer, readingTimeMs } from "../speech";
import { createBoardStore } from "../store";
import { MAX_SVG_CHARS, createActionQueue } from "./queue";
import type { QueueState, StreamError } from "./types";

const messagesOf = (name: FixtureName): StreamMessage[] => FIXTURE_TURNS[name].messages.map((m) => m.message);
const intro = messagesOf("rome-intro");
const isAction = (m: StreamMessage): m is Extract<StreamMessage, { type: "action" }> => m.type === "action";

function setup() {
  const warnings: string[] = [];
  const store = createBoardStore({ onWarning: (w) => warnings.push(w) });
  const speech = new TextSpeechPlayer();
  const states: QueueState[] = [];
  const captions: string[] = [];
  const errors: StreamError[] = [];
  const queue = createActionQueue({
    store,
    speech,
    onStateChange: (s) => states.push(s),
    onCaption: (c) => captions.push(c.text),
    onWarning: (w) => warnings.push(w),
    onError: (e) => errors.push(e),
  });
  const ids = () => [...store.getState().elements.keys()];
  return { store, speech, queue, states, captions, warnings, errors, ids };
}

const drawDiagram = (order: number): StreamMessage => ({
  type: "action",
  order,
  action: { id: "d", name: "draw", args: { id: "diag", column: "visuals", prompt: "p", is_structured: true, max_dimensions: { w: 100, h: 100 } } },
});

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
    const shuffled = [...intro.filter(isAction)].reverse(); // worst case: last first
    t.queue.beginTurn();
    for (const m of shuffled) t.queue.push(m);
    for (const m of intro.filter((m) => !isAction(m))) t.queue.push(m);
    await vi.runAllTimersAsync();
    expect(t.ids()).toEqual(["title", "colosseum", "tl_republica"]);
    expect(t.store.getElement("colosseum")).toMatchObject({ status: "ready", data: { url: "/files/gen/colosseum.jpg" } });
    expect(t.captions).toHaveLength(2);
    expect(t.warnings).toEqual([]);
  });

  it("speak gates the next action; draw does not block", async () => {
    const t = setup();
    const msgs = intro.slice(0, 5); // write_text, speak, speech_alignment, draw, write_timeline
    t.queue.beginTurn();
    expect(t.queue.getState()).toBe("thinking");
    for (const m of msgs) t.queue.push(m);
    await flush();
    expect(t.ids()).toEqual(["title"]); // speaking: the draw waits
    expect(t.queue.getState()).toBe("playing");
    const speak = msgs[1] as Extract<StreamMessage, { type: "action" }>;
    if (speak.action.name !== "speak") throw new Error("fixture changed");
    await vi.advanceTimersByTimeAsync(readingTimeMs(speak.action.args.text) - 10);
    expect(t.ids()).toEqual(["title"]);
    await vi.advanceTimersByTimeAsync(20);
    // draw placeholder and the timeline land together: draw continued immediately
    expect(t.ids()).toEqual(["title", "colosseum", "tl_republica"]);
    expect(t.store.getElement("colosseum")?.status).toBe("placeholder");
  });

  it("script_done ends the script and a late draw_result still swaps the image", async () => {
    const t = setup();
    const scriptDoneAt = intro.findIndex((m) => m.type === "script_done");
    t.queue.beginTurn();
    for (const m of intro.slice(0, scriptDoneAt + 1)) t.queue.push(m);
    await vi.runAllTimersAsync();
    expect(t.queue.getState()).toBe("idle");
    expect(t.queue.isScriptDone()).toBe(true);
    expect(t.store.getElement("colosseum")?.status).toBe("placeholder");
    for (const m of intro.slice(scriptDoneAt + 1)) t.queue.push(m); // draw_result, turn_done
    await vi.runAllTimersAsync();
    expect(t.store.getElement("colosseum")?.status).toBe("ready");
    expect(t.queue.getState()).toBe("idle");
    expect(t.states).toEqual(["thinking", "playing", "idle", "playing", "idle"]);
  });

  it("a script that ends on ask_verification waits for the answer", async () => {
    const t = setup();
    t.queue.beginTurn();
    for (const m of intro) t.queue.push(m);
    await vi.runAllTimersAsync();
    t.queue.beginTurn();
    for (const m of messagesOf("click-and-ask")) t.queue.push(m);
    await vi.runAllTimersAsync();
    expect(t.queue.getState()).toBe("waiting_answer");
    expect(t.store.getElement("q_augusto")?.type).toBe("question");
  });

  it("interrupt() clears pending synchronously, keeps the board and returns the payload", async () => {
    const t = setup();
    t.queue.beginTurn();
    for (const m of intro) t.queue.push(m); // script_done delivers the turn id
    await flush();
    await vi.advanceTimersByTimeAsync(1500); // midway through the first speak
    const payload = t.queue.interrupt();
    // spoken_chars from speech_alignment: the words that ended by 1500 ms.
    expect(payload).toEqual({ turn_id: "turn_1", action_id: "act_2", spoken_ms: 1500, spoken_chars: "Hoje vamos ver como Roma".length });
    expect(t.queue.getState()).toBe("idle");
    const before = t.ids();
    expect(before).toEqual(["title"]);
    await vi.runAllTimersAsync();
    expect(t.ids()).toEqual(before); // nothing else plays
    expect(t.queue.interrupt()).toBeNull(); // nothing left to cut
  });

  it("interrupt() returns null before the first script_done of the session (no turn id known)", async () => {
    const t = setup();
    t.queue.beginTurn();
    for (const m of intro.slice(0, 3)) t.queue.push(m);
    await flush();
    expect(t.queue.interrupt()).toBeNull();
    expect(t.queue.getState()).toBe("idle");
  });

  it("interrupt() before script_done uses the previous turn's id", async () => {
    const t = setup();
    t.queue.beginTurn();
    for (const m of intro) t.queue.push(m);
    await vi.runAllTimersAsync();
    expect(t.queue.getLastTurnId()).toBe("turn_1");
    t.queue.beginTurn();
    const click = messagesOf("click-and-ask");
    t.queue.push(click[0]!); // the first speak, no script_done yet
    await vi.advanceTimersByTimeAsync(500);
    expect(t.queue.interrupt()).toMatchObject({ turn_id: "turn_1", action_id: "act_11", spoken_ms: 500 });
  });

  it("setLastTurnId() seeds the id of a reopened session", async () => {
    const t = setup();
    t.queue.setLastTurnId("turn_7");
    t.queue.beginTurn();
    t.queue.push(intro[0]!);
    await flush();
    expect(t.queue.interrupt()).toEqual({ turn_id: "turn_7" });
  });

  it("uses speech_alignment for spoken_chars", async () => {
    const t = setup();
    const speak: Action = { id: "s1", name: "speak", args: { text: "Roma era uma república" } };
    t.queue.beginTurn();
    t.queue.push({
      type: "speech_alignment",
      action_id: "s1",
      words: [
        { word: "Roma", start_ms: 0, end_ms: 300 },
        { word: "era", start_ms: 300, end_ms: 500 },
        { word: "uma", start_ms: 500, end_ms: 900 },
      ],
    });
    t.queue.push({ type: "action", order: 0, action: speak });
    t.queue.push({ type: "script_done", turn_id: "turn_a" });
    expect(t.queue.getAlignment("s1")).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(600);
    expect(t.queue.interrupt()).toEqual({ turn_id: "turn_a", action_id: "s1", spoken_ms: 600, spoken_chars: "Roma era".length });
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
    expect(t.ids()).toHaveLength(3);
  });

  it("warns on duplicate orders and unknown targets", async () => {
    const t = setup();
    t.queue.beginTurn();
    const click = messagesOf("click-and-ask"); // highlights tl_republica, absent on an empty board
    for (const m of click) t.queue.push(m);
    t.queue.push(click[0]!); // duplicate order 0
    await vi.runAllTimersAsync();
    expect(t.ids()).toEqual(["nota_augusto", "q_augusto"]);
    expect(t.warnings.some((w) => w.includes("duplicate order 0"))).toBe(true);
    expect(t.warnings.some((w) => w.includes("tl_republica"))).toBe(true);
  });

  it("skips an order gap once the turn is done", async () => {
    const t = setup();
    t.queue.beginTurn();
    t.queue.push({ type: "action", order: 1, action: { id: "w", name: "write_text", args: { id: "late", column: "main", html: "<p>x</p>" } } });
    await flush();
    expect(t.ids()).toEqual([]);
    t.queue.push({ type: "turn_done", turn_id: "turn_gap" });
    await vi.runAllTimersAsync();
    expect(t.ids()).toEqual(["late"]);
    expect(t.warnings.some((w) => w.includes("missing order 0"))).toBe(true);
  });

  it("applies streamed svg chunks on turn_done", async () => {
    const t = setup();
    t.queue.beginTurn();
    t.queue.push(drawDiagram(0));
    t.queue.push({ type: "svg_chunk", element_id: "diag", chunk: '<svg viewBox="0 0 1 1">' });
    t.queue.push({ type: "svg_chunk", element_id: "diag", chunk: "<rect></rect></svg>" });
    t.queue.push({ type: "script_done", turn_id: "turn_svg" });
    await vi.runAllTimersAsync();
    expect(t.store.getElement("diag")?.status).toBe("placeholder");
    t.queue.push({ type: "turn_done", turn_id: "turn_svg" });
    await vi.runAllTimersAsync();
    expect(t.store.getElement("diag")).toMatchObject({ type: "svg", status: "ready", data: { svg: '<svg viewBox="0 0 1 1"><rect></rect></svg>' } });
  });

  it("caps streamed svg per element and warns once", async () => {
    const t = setup();
    t.queue.beginTurn();
    t.queue.push(drawDiagram(0));
    const chunk = "x".repeat(60_000);
    for (let i = 0; i < 5; i++) t.queue.push({ type: "svg_chunk", element_id: "diag", chunk });
    t.queue.push({ type: "turn_done", turn_id: "turn_big" });
    await vi.runAllTimersAsync();
    const el = t.store.getElement("diag");
    expect(el?.type === "svg" && el.data.svg?.length).toBe(MAX_SVG_CHARS - (MAX_SVG_CHARS % 60_000));
    expect(t.warnings.filter((w) => w.includes("rest dropped"))).toHaveLength(1);
  });

  it("surfaces errors; a non-recoverable error finishes the turn", async () => {
    const t = setup();
    t.queue.beginTurn();
    t.queue.push({ type: "error", code: "tts_slow", message: "lento", recoverable: true });
    expect(t.queue.getState()).toBe("thinking");
    t.queue.push({ type: "error", code: "llm_failed", message: "falhou", recoverable: false });
    await vi.runAllTimersAsync();
    expect(t.errors.map((e) => e.recoverable)).toEqual([true, false]);
    expect(t.queue.getState()).toBe("idle");
  });

  it("endTurn() finishes a stream that closed without turn_done", async () => {
    const t = setup();
    t.queue.beginTurn();
    for (const m of intro.filter(isAction)) t.queue.push(m);
    t.queue.endTurn();
    await vi.runAllTimersAsync();
    expect(t.ids()).toEqual(["title", "colosseum", "tl_republica"]);
    expect(t.queue.getState()).toBe("idle");
  });
});

describe("speak with audio_url", () => {
  const speak: Action = { id: "s1", name: "speak", args: { text: "Roma era uma república.", audio_url: "/api/tts/s1" } };
  const next: StreamMessage = { type: "action", order: 1, action: { id: "w1", name: "write_text", args: { id: "after", column: "main", html: "<p>x</p>" } } };

  function withAudio(play: SpeechPlayer["play"]) {
    const audio: SpeechPlayer = { play: vi.fn(play), stop: vi.fn(), onWord: () => () => {}, level: () => 0 };
    const warnings: string[] = [];
    const store = createBoardStore();
    const queue = createActionQueue({ store, speech: new TextSpeechPlayer(), audio, onWarning: (w) => warnings.push(w) });
    queue.beginTurn();
    queue.push({ type: "action", order: 0, action: speak });
    queue.push(next);
    queue.push({ type: "turn_done", turn_id: "turn_a" });
    return { audio, store, warnings };
  }

  it("plays the audio as given and waits for it", async () => {
    let finish = () => {};
    const t = withAudio(() => new Promise<void>((r) => (finish = r)));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(t.audio.play).toHaveBeenCalledWith("/api/tts/s1", expect.any(AbortSignal));
    expect(t.store.getElement("after")).toBeUndefined();
    finish();
    await flush();
    expect(t.store.getElement("after")).toBeDefined();
  });

  it("falls back to the text clock when the audio fails (404/503)", async () => {
    const t = withAudio(() => Promise.reject(new Error("audio fetch failed: HTTP 404")));
    await flush();
    expect(t.store.getElement("after")).toBeUndefined(); // the text clock still gates the next action
    await vi.advanceTimersByTimeAsync(readingTimeMs("Roma era uma república."));
    expect(t.store.getElement("after")).toBeDefined();
    expect(t.warnings.some((w) => w.includes("HTTP 404") && w.includes("text clock"))).toBe(true);
  });
});
