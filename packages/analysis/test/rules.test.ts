import { describe, expect, it } from "vitest";
import { buildAnalysisInput, computeFindings, confidenceFor, selectRule, conceptMetrics, severityOf } from "../src";
import { InMemoryConversationSource } from "../src";
import { LAB_CONVERSATIONS_PATH, FileConversationSource, idMapsFromRepo } from "../src";
import { MemoryRepository } from "@mento/db";
import { seedLabMaterial, seedStudents } from "../src";
import { ev, input, makeBundle, sess } from "./helpers";

const C = "Formas de governo";
const KEY = "formas de governo";
const findingFor = (inp: ReturnType<typeof input>) => computeFindings(inp).find((f) => f.concept_key === KEY);

describe("rules-v1 severity (BR-01)", () => {
  const cases: [string, ReturnType<typeof input>, string, string][] = [
    ["R1: 2 incorrect in the same session", input([sess("s1", [ev(C, "incorrect"), ev(C, "incorrect")])]), "R1_repeated_errors", "critical"],
    ["R3: incorrect in two different sessions", input([sess("s1", [ev(C, "incorrect")]), sess("s2", [ev(C, "incorrect")])]), "R3_recurring", "critical"],
    ["M1: a single incorrect", input([sess("s1", [ev(C, "incorrect")])]), "M1_single_error", "medium"],
    ["M1: a single partial", input([sess("s1", [ev(C, "partial")])]), "M1_single_error", "medium"],
    ["M2: correct only with hints", input([sess("s1", [ev(C, "correct", { hints: 1 })])]), "M2_needs_hints", "medium"],
    ["P1: 2 independent correct", input([sess("s1", [ev(C, "correct"), ev(C, "correct")])]), "P1_consistent", "positive"],
    ["P3: 1 independent correct", input([sess("s1", [ev(C, "correct")])]), "P3_first_success", "positive"],
    ["P2: earlier incorrect, now 2 independent correct and no error", input([sess("s1", [ev(C, "incorrect")]), sess("s2", [ev(C, "correct"), ev(C, "correct")])]), "P2_resolved", "positive"],
  ];
  it.each(cases)("BR-01 %s", (_name, inp, rule, severity) => {
    const f = findingFor(inp);
    expect(f?.rule).toBe(rule);
    expect(f?.severity).toBe(severity);
    expect(f?.kind).toBe(severity === "positive" ? "progress" : "gap");
  });

  it("BR-01 boundaries: 1 incorrect is not R1; 1 independent correct after an error is not P2", () => {
    expect(findingFor(input([sess("s1", [ev(C, "incorrect")])]))?.rule).toBe("M1_single_error");
    expect(findingFor(input([sess("s1", [ev(C, "incorrect")]), sess("s2", [ev(C, "correct")])]))?.rule).toBe("M1_single_error");
  });

  it("BR-01 severity follows the rule prefix", () => {
    expect(["R1_repeated_errors", "R3_recurring"].map((r) => severityOf(r as never))).toEqual(["critical", "critical"]);
    expect(severityOf("M2_needs_hints")).toBe("medium");
    expect(severityOf("P2_resolved")).toBe("positive");
  });

  it("BR-01 only concepts that appear in the trigger session get a finding, most severe first", () => {
    const inp = input([sess("s1", [ev("Cidadania", "incorrect")]), sess("s2", [ev("Crise", "correct"), ev(C, "incorrect"), ev(C, "incorrect")])]);
    const findings = computeFindings(inp);
    expect(findings.map((f) => f.concept_key)).toEqual([KEY, "crise"]);
    expect(findings.map((f) => f.severity)).toEqual(["critical", "positive"]);
  });
});

describe("rule precedence: the first matching rule wins (BR-02)", () => {
  it("BR-02 P2 beats R3 when the latest session recovers", () => {
    const inp = input([sess("s0", [ev(C, "incorrect")]), sess("s1", [ev(C, "incorrect")]), sess("s2", [ev(C, "correct"), ev(C, "correct")])]);
    expect(conceptMetrics(inp, KEY).incorrect_sessions).toBe(2);
    expect(findingFor(inp)?.rule).toBe("P2_resolved");
  });
  it("BR-02 R1 beats P1 when a session has 2 errors and 2 independent successes", () => {
    const inp = input([sess("s1", [ev(C, "incorrect"), ev(C, "incorrect"), ev(C, "correct"), ev(C, "correct")])]);
    expect(findingFor(inp)?.rule).toBe("R1_repeated_errors");
  });
  it("BR-02 M1 beats M2 when an error sits next to a hint-assisted success", () => {
    expect(findingFor(input([sess("s1", [ev(C, "incorrect"), ev(C, "correct", { hints: 2 })])]))?.rule).toBe("M1_single_error");
  });
  it("BR-02 selectRule is a pure function of the metrics", () => {
    const m = conceptMetrics(input([sess("s1", [ev(C, "incorrect")])]), KEY);
    expect(selectRule(m)).toBe(selectRule({ ...m }));
  });
});

describe("short sessions generate nothing (BR-03)", () => {
  it("BR-03 one message and no evidence: skipped, zero findings", () => {
    const inp = input([sess("s1", [], { messages: 1 })]);
    expect(inp.skip_reason).toBe("short_session");
    expect(computeFindings(inp)).toEqual([]);
  });

  it("BR-03 the builder skips the lab conversation of Eduarda but analyzes one message with one piece of evidence", async () => {
    const repo = new MemoryRepository();
    const students = await seedStudents(repo);
    const material = await seedLabMaterial(repo);
    const source = new FileConversationSource(LAB_CONVERSATIONS_PATH, idMapsFromRepo(repo));
    const eduarda = (await source.getSessionBundle("ses_eduarda_01"))!;
    const skipped = buildAnalysisInput({ trigger: eduarda, history: [eduarda], material, class_context: null });
    expect(skipped.skip_reason).toBe("short_session");

    const studentId = students[0]!.id;
    const oneMessage = makeBundle({ id: "s1", student_id: studentId, material_id: material.id, started_at: "2026-10-30T10:00:00Z", messages: 1, verifications: [{ concept: C, lesson: "L2", result: "incorrect", answer: "x" }] });
    const analyzed = buildAnalysisInput({ trigger: oneMessage, history: [oneMessage], material, class_context: null });
    expect(analyzed.skip_reason).toBeNull();
    expect(computeFindings(analyzed)).toHaveLength(1);
  });

  it("BR-03 history never includes sessions that started after the trigger", async () => {
    const repo = new MemoryRepository();
    const material = await seedLabMaterial(repo);
    const a = makeBundle({ id: "a", student_id: "s", material_id: material.id, started_at: "2026-10-01T10:00:00Z", verifications: [{ concept: C, result: "incorrect", answer: "a" }] });
    const b = makeBundle({ id: "b", student_id: "s", material_id: material.id, started_at: "2026-10-05T10:00:00Z", verifications: [{ concept: C, result: "incorrect", answer: "b" }] });
    const inp = buildAnalysisInput({ trigger: a, history: [a, b], material, class_context: null });
    expect(inp.sessions.map((s) => s.session_id)).toEqual(["a"]);
    expect(new InMemoryConversationSource([a, b])).toBeTruthy();
  });
});

describe("confidence is a formula, not an opinion (BR-04)", () => {
  it.each([
    ["M1_single_error", 1, 0.4],
    ["M1_single_error", 2, 0.45],
    ["R1_repeated_errors", 2, 0.75],
    ["R3_recurring", 2, 0.85],
    ["R3_recurring", 3, 0.9],
    ["P2_resolved", 3, 0.9],
    ["P1_consistent", 2, 0.75],
    ["P3_first_success", 1, 0.4],
  ] as const)("BR-04 %s with %i attempts = %f", (rule, attempts, expected) => {
    expect(confidenceFor(rule, attempts)).toBe(expected);
  });

  it("BR-04 one attempt never exceeds 0.5, whatever the rule; the cap is 0.9", () => {
    expect(confidenceFor("R3_recurring", 1)).toBe(0.5);
    expect(confidenceFor("P2_resolved", 1)).toBe(0.5);
    expect(confidenceFor("R3_recurring", 20)).toBe(0.9);
  });

  it("BR-04 the finding carries the formula value", () => {
    const f = findingFor(input([sess("s1", [ev(C, "incorrect")]), sess("s2", [ev(C, "incorrect"), ev(C, "partial")])]));
    expect(f?.metrics.attempts).toBe(3);
    expect(f?.confidence).toBe(0.9);
  });
});
