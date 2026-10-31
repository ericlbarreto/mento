import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Action, FixtureTurn, normalizeConcept, StreamMessage } from "@mento/contracts";
import { describe, expect, it } from "vitest";
import { FIXTURE_TURNS, MOCK_STUDENTS, DEMO_STUDENT_ID, namespaceFixtureMessage, pickFixture, replayFixture } from ".";

const fixturesDir = join(import.meta.dirname, "../../../../fixtures/turns");

describe("repo fixtures (fixtures/turns)", () => {
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));
  it("every file is loaded by the mock", () => {
    expect(files.map((f) => f.replace(/\.json$/, "")).sort()).toEqual(Object.keys(FIXTURE_TURNS).sort());
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

describe("mock students", () => {
  it("the demo student comes first", () => {
    expect(MOCK_STUDENTS[0]).toEqual({ id: DEMO_STUDENT_ID, name: "Ana S." });
    expect(DEMO_STUDENT_ID).toBe("demo-ana");
  });
});

describe("pickFixture", () => {
  it("alternates rome-intro and click-and-ask, one round per pair", () => {
    expect([0, 1, 2, 3, 4].map(pickFixture)).toEqual([
      { name: "rome-intro", round: 0 },
      { name: "click-and-ask", round: 0 },
      { name: "rome-intro", round: 1 },
      { name: "click-and-ask", round: 1 },
      { name: "rome-intro", round: 2 },
    ]);
  });
});

describe("namespaceFixtureMessage", () => {
  const all = Object.values(FIXTURE_TURNS).flatMap((f) => f.messages.map((m) => m.message));
  it("round 0 is the fixture as recorded", () => {
    for (const m of all) expect(namespaceFixtureMessage(m, 0)).toBe(m);
  });
  it("later rounds give new ids that still match the contracts, keeping audio_url", () => {
    for (const m of all) {
      const out = namespaceFixtureMessage(m, 1);
      expect(StreamMessage.safeParse(out).success).toBe(true);
      if (out.type === "action") {
        expect(Action.safeParse(out.action).success).toBe(true);
        expect(out.action.id).toMatch(/_r1$/);
        if (out.action.name === "speak" && m.type === "action" && m.action.name === "speak") {
          expect(out.action.args.audio_url).toBe(m.action.args.audio_url);
        }
      }
    }
    const click = FIXTURE_TURNS["click-and-ask"].messages.map((x) => namespaceFixtureMessage(x.message, 2));
    const highlight = click.find((m) => m.type === "action" && m.action.name === "highlight");
    expect(highlight?.type === "action" && highlight.action.args).toEqual({ target_id: "tl_republica_r2", color: "yellow" });
  });
});

describe("replayFixture", () => {
  it("stops quietly when the signal aborts", async () => {
    const controller = new AbortController();
    const seen: string[] = [];
    // speed 10: write_text at 0 ms, speak at 600 ms; abort in between.
    setTimeout(() => controller.abort(), 300);
    for await (const m of replayFixture("rome-intro", { signal: controller.signal, speed: 10 })) seen.push(m.type);
    expect(seen).toEqual(["action"]);
  });
  it("yields nothing when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const seen: unknown[] = [];
    for await (const m of replayFixture("click-and-ask", { signal: controller.signal })) seen.push(m);
    expect(seen).toEqual([]);
  });
  it("speed 0 replays instantly, namespaced by round", async () => {
    const ids: string[] = [];
    for await (const m of replayFixture("click-and-ask", { speed: 0, round: 1 })) if (m.type === "turn_done") ids.push(m.turn_id);
    expect(ids).toEqual(["turn_2_r1"]);
  });
});
