import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { pickFixture } from "./mock";
import { Citation, DrawResultArgs, SpeakArgs, TurnRequest, TurnStreamMessage, TutorAction } from "./protocol";

const fixturesDir = join(import.meta.dirname, "../fixtures");
const MAT = "665f1a2b3c4d5e6f7a8b9c01";

describe("fixtures", () => {
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));
  it("has the four Rome fixtures", () => {
    expect(files.sort()).toEqual(["rome-click-27bc.json", "rome-intro.json", "rome-outside-material.json", "rome-wrong-answer.json"]);
  });
  it.each(files)("%s parses as TurnStreamMessage[]", (file) => {
    const data: unknown = JSON.parse(readFileSync(join(fixturesDir, file), "utf8"));
    const msgs = z.array(TurnStreamMessage).parse(data);
    expect(msgs[0]).toHaveProperty("turn_id");
    expect(msgs.at(-1)).toEqual({ done: true });
  });
});

describe("protocol rejects bad shapes", () => {
  it("unknown tool name", () => {
    expect(TutorAction.safeParse({ id: "a1", name: "record_evidence", args: {} }).success).toBe(false);
    expect(TutorAction.safeParse({ id: "a1", name: "paint", args: {} }).success).toBe(false);
  });
  it("unknown column", () => {
    const action = { id: "a1", name: "write_text", args: { id: "t", html: "<p>x</p>", column: "left" } };
    expect(TutorAction.safeParse(action).success).toBe(false);
    expect(TutorAction.safeParse({ ...action, args: { ...action.args, column: "main" } }).success).toBe(true);
  });
  it("camelCase key", () => {
    expect(TutorAction.safeParse({ id: "a1", name: "highlight", args: { targetId: "t", color: "yellow" } }).success).toBe(false);
    expect(TurnStreamMessage.safeParse({ stream: "svg", elementId: "d", chunk: "<svg" }).success).toBe(false);
  });
  it("hint without hint_level", () => {
    expect(SpeakArgs.safeParse({ text: "Dica", purpose: "hint" }).success).toBe(false);
    expect(SpeakArgs.safeParse({ text: "Dica", purpose: "hint", hint_level: 2 }).success).toBe(true);
  });
  it("draw_result without url or svg", () => {
    expect(DrawResultArgs.safeParse({ element_id: "d" }).success).toBe(false);
    expect(DrawResultArgs.safeParse({ element_id: "d", svg: "<svg/>" }).success).toBe(true);
  });
  it("citation page 0", () => {
    expect(Citation.safeParse({ material_id: MAT, page: 0, quote: "x" }).success).toBe(false);
    expect(Citation.safeParse({ material_id: MAT, page: 1, quote: "x" }).success).toBe(true);
  });
});

describe("pickFixture", () => {
  const chat = TurnRequest.parse({ appended: [{ name: "user_message", kind: "chat", text: "oi" }], modality: "text" });
  const click = TurnRequest.parse({
    appended: [{ name: "user_message", kind: "board_select", text: "o que é isso?", selected: { element_id: "timeline_rome", text: "27 a.C." } }],
    modality: "text",
  });
  const answer = TurnRequest.parse({
    appended: [{ name: "answer_submit", verification_id: "ver_1", element_id: "el_q_republic_end", answer: "Porque o Senado acabou" }],
    modality: "text",
  });
  it("routes by turn index and request content", () => {
    expect(pickFixture(chat, 0)).toBe("rome-intro");
    expect(pickFixture(click, 0)).toBe("rome-intro");
    expect(pickFixture(click, 1)).toBe("rome-click-27bc");
    expect(pickFixture(answer, 2)).toBe("rome-wrong-answer");
    expect(pickFixture(chat, 3)).toBe("rome-outside-material");
  });
});
