import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeConcept } from "@mento/contracts";
import { describe, expect, it } from "vitest";
import { FIXTURE_TURNS, pickFixture, replayFixture } from "./mock";
import { Action, FixtureTurn, SpeakArgs, StreamMessage, TurnRequest } from "./protocol";

const fixturesDir = join(import.meta.dirname, "../fixtures");

describe("fixtures", () => {
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));
  it("has the four Rome fixtures", () => {
    expect(files.sort()).toEqual(["click-and-ask.json", "outside-material.json", "rome-intro.json", "wrong-answer.json"]);
  });
  it.each(files)("%s parses as FixtureTurn and ends with script_done then turn_done", (file) => {
    const fixture = FixtureTurn.parse(JSON.parse(readFileSync(join(fixturesDir, file), "utf8")));
    const msgs = fixture.messages.map((m) => m.message);
    const scriptDone = msgs.find((m) => m.type === "script_done");
    const last = msgs.at(-1);
    expect(last?.type).toBe("turn_done");
    expect(scriptDone && last?.type === "turn_done" && scriptDone.turn_id === last.turn_id).toBe(true);
    const times = fixture.messages.map((m) => m.at_ms);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
  it("verification concept_key is normalizeConcept(concept)", () => {
    for (const { messages } of Object.values(FIXTURE_TURNS)) {
      for (const { message } of messages) {
        if (message.type === "action" && message.action.name === "ask_verification") {
          expect(message.action.args.concept_key).toBe(normalizeConcept(message.action.args.concept));
        }
      }
    }
  });
});

describe("protocol rejects bad shapes", () => {
  it("unknown stream type", () => {
    expect(StreamMessage.safeParse({ type: "done" }).success).toBe(false);
  });
  it("unknown tool name", () => {
    expect(Action.safeParse({ id: "a1", name: "write_latex", args: { id: "eq", latex: "x", column: "main" } }).success).toBe(false);
  });
  it("unknown column", () => {
    const action = { id: "a1", name: "write_text", args: { id: "t", html: "<p>x</p>", column: "left" } };
    expect(Action.safeParse(action).success).toBe(false);
    expect(Action.safeParse({ ...action, args: { ...action.args, column: "main" } }).success).toBe(true);
  });
  it("element id that is not a snake_case slug", () => {
    expect(Action.safeParse({ id: "a1", name: "highlight", args: { target_id: "Bad-Id", color: "yellow" } }).success).toBe(false);
  });
  it("hint without hint_level", () => {
    expect(SpeakArgs.safeParse({ text: "Dica", purpose: "hint" }).success).toBe(false);
    expect(SpeakArgs.safeParse({ text: "Dica", purpose: "hint", hint_level: 2 }).success).toBe(true);
  });
  it("verification_answer without verification_id", () => {
    const req = { modality: "text", appended: [{ name: "verification_answer", element_id: "q_republic_end", answer: "x" }] };
    expect(TurnRequest.safeParse(req).success).toBe(false);
  });
  it("word that ends before it starts", () => {
    const bad = { type: "speech_alignment", action_id: "a1", words: [{ word: "x", start_ms: 500, end_ms: 100 }] };
    expect(StreamMessage.safeParse(bad).success).toBe(false);
  });
});

describe("pickFixture", () => {
  const opening = TurnRequest.parse({ appended: [], modality: "text" });
  const chat = TurnRequest.parse({ appended: [{ name: "user_message", kind: "chat", text: "oi" }], modality: "text" });
  const click = TurnRequest.parse({
    appended: [{ name: "user_message", kind: "board_select", text: "o que é isso?", selected: { element_id: "timeline_rome", text: "27 a.C." } }],
    modality: "text",
  });
  const answer = TurnRequest.parse({
    appended: [{ name: "verification_answer", verification_id: "ver_1", element_id: "q_republic_end", answer: "Porque o Senado acabou" }],
    modality: "text",
  });
  it("routes by turn index and request content", () => {
    expect(pickFixture(chat, 0)).toBe("rome-intro");
    expect(pickFixture(opening, 3)).toBe("rome-intro");
    expect(pickFixture(click, 1)).toBe("click-and-ask");
    expect(pickFixture(answer, 2)).toBe("wrong-answer");
    expect(pickFixture(chat, 3)).toBe("outside-material");
  });
});

describe("replayFixture", () => {
  it("stops quietly when the signal aborts", async () => {
    const controller = new AbortController();
    const seen: string[] = [];
    setTimeout(() => controller.abort(), 1300); // after the first action (at_ms 1200), well before the rest
    for await (const m of replayFixture("rome-intro", { signal: controller.signal })) seen.push(m.type);
    expect(seen).toEqual(["action"]);
  });
  it("yields nothing when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const seen: unknown[] = [];
    for await (const m of replayFixture("click-and-ask", { signal: controller.signal })) seen.push(m);
    expect(seen).toEqual([]);
  });
});
