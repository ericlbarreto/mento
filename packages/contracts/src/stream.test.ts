import { describe, expect, it } from "vitest";
import { StreamMessage } from "./stream";
import { SttCaption } from "./speech";

describe("StreamMessage", () => {
  it("accepts every message kind", () => {
    const messages = [
      { type: "action", order: 0, action: { id: "act_1", name: "speak", args: { text: "Olá!" } } },
      { type: "svg_chunk", element_id: "diagram", chunk: "<svg" },
      { type: "speech_alignment", action_id: "act_1", words: [{ word: "Olá!", start_ms: 0, end_ms: 320 }] },
      { type: "script_done", turn_id: "turn_1" },
      { type: "turn_done", turn_id: "turn_1", timing: { first_action_ms: 1380, script_done_ms: 4100 } },
      { type: "error", code: "llm_timeout", message: "O tutor demorou demais.", recoverable: true },
    ];
    for (const m of messages) expect(StreamMessage.safeParse(m).success, JSON.stringify(m)).toBe(true);
  });

  it("rejects an unknown type and a word with end before start", () => {
    expect(StreamMessage.safeParse({ type: "done" }).success).toBe(false);
    const bad = { type: "speech_alignment", action_id: "act_1", words: [{ word: "x", start_ms: 500, end_ms: 100 }] };
    expect(StreamMessage.safeParse(bad).success).toBe(false);
  });
});

describe("SttCaption", () => {
  it("accepts interim and final captions with word timings", () => {
    const caption = {
      kind: "final",
      text: "Quem foi Augusto?",
      words: [
        { word: "Quem", start_ms: 0, end_ms: 200, confidence: 0.98 },
        { word: "foi", start_ms: 210, end_ms: 350, confidence: 0.97 },
        { word: "Augusto?", start_ms: 360, end_ms: 800, confidence: 0.93 },
      ],
      speech_final: true,
    };
    expect(SttCaption.safeParse(caption).success).toBe(true);
    expect(SttCaption.safeParse({ ...caption, kind: "partial" }).success).toBe(false);
  });
});
