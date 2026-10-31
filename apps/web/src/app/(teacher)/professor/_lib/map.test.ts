import type { Insight } from "@mento/contracts";
import { describe, expect, it } from "vitest";
import { buildStudentDetail, conceptState, gapsOf, topicsOf } from "./map";
import type { InsightsDto } from "./schemas";

const metrics = { attempts: 2, correct: 0, partial: 0, incorrect: 2, independent_correct: 0, hints_used: 0, sessions: 1, incorrect_sessions: 1, last_attempts: 2, last_incorrect: 2, last_independent_correct: 0, earlier_incorrect: 0 };
const insight = (over: Partial<Insight>): Insight => ({
  id: "i1", student_id: "s1", session_id: "ses1", analysis_id: "a1", kind: "gap", severity: "critical", rule: "R1_repeated_errors", rules_version: "rules-v1",
  concept: "Formas de governo", concept_key: "formas de governo", title: "t", body: "b", confidence: 0.75, evidence: [{ event_id: "e1", quote: "o rei é eleito" }],
  diagnosis: "prerequisite", root_cause: { lesson_id: "L1", title: "Cap. 1", pages: [1, 2], taught_in_class: false, reasoning: "r" }, studying_lesson_id: "L3",
  related_gap_id: null, material_ref: { lesson_id: "L1", pages: [1, 2] }, metrics, source: "template", status: "new", created_at: "2026-10-31T00:00:00Z", updated_at: "2026-10-31T00:00:00Z", ...over,
});
const dto = (items: Insight[]): InsightsDto => ({
  counts: { critical: 0, medium: 0, positive: 0 },
  critical: items.filter((i) => i.severity === "critical"),
  medium: items.filter((i) => i.severity === "medium"),
  positive: items.filter((i) => i.severity === "positive"),
});

describe("gapsOf", () => {
  it("links each gap to its suggestion and puts critical first", () => {
    const gap = insight({});
    const medium = insight({ id: "i3", severity: "medium", rule: "M1_single_error", concept: "Pão e circo", confidence: 0.4 });
    const sug = insight({ id: "i2", kind: "suggestion", severity: "critical", related_gap_id: "i1", title: "Retomar o capítulo 1" });
    const out = gapsOf(dto([medium, sug, gap]));
    expect(out.map((g) => g.id)).toEqual(["i1", "i3"]);
    expect(out[0]!.suggestion?.title).toBe("Retomar o capítulo 1");
    expect(out[0]!.root_cause?.lesson_id).toBe("L1");
    expect(out[0]!.attempts).toBe(2);
    expect(out[1]!.suggestion).toBeNull();
  });

  it("ignores a dismissed suggestion and marks accepted gaps", () => {
    const out = gapsOf(dto([insight({ status: "accepted" }), insight({ id: "i2", kind: "suggestion", related_gap_id: "i1", status: "dismissed" })]));
    expect(out[0]!.accepted).toBe(true);
    expect(out[0]!.suggestion).toBeNull();
  });
});

describe("conceptState", () => {
  it("is a gap while a gap is open, sampling under 3 answers, consolidated after two right in a row", () => {
    expect(conceptState(["correct", "correct"], 4, true)).toBe("gap");
    expect(conceptState(["incorrect"], 2, false)).toBe("sampling");
    expect(conceptState(["incorrect", "correct", "correct"], 5, false)).toBe("consolidated");
    expect(conceptState(["correct", "incorrect"], 4, false)).toBe("in_transition");
  });
});

describe("buildStudentDetail", () => {
  it("builds the page data: sessions newest first, resolved gaps, concept map and the latest summary", () => {
    const session = (id: string, started_at: string) => ({ id, topic: "Império", material_id: "m", material_title: "Apostila", lesson_id: "L3", lesson_title: "O Império", started_at, ended_at: null, analysis_status: "done", insight_count: 1, concepts: [], questions: 0, correct: 0, incorrect: 0 });
    const detail = buildStudentDetail({
      studentId: "s1",
      sessions: [session("ses1", "2026-10-30T10:00:00Z"), session("ses2", "2026-10-31T10:00:00Z")],
      detail: { conversations: 2, latest_analysis: { session_id: "ses2", summary: "Está estudando o Império.", studying_lesson_id: "L3", studying_lesson_title: "O Império", analyzed_at: "2026-10-31T10:05:00Z" } },
      open: dto([insight({})]),
      resolved: dto([insight({ id: "old", status: "resolved", concept: "Patrícios" })]),
      evolution: [{ concept: "Formas de governo", concept_key: "formas de governo", n: 2, state: "insufficient_evidence", series: [{ session_id: "ses1", started_at: "x", attempts: 2, correct: 0, partial: 0, incorrect: 2, independent_correct: 0 }] }],
    });
    expect(detail.sessions.map((s) => s.id)).toEqual(["ses2", "ses1"]);
    expect(detail.sessions[0]!.summary).toBe("Está estudando o Império.");
    expect(detail.resolved.map((g) => g.id)).toEqual(["old"]);
    expect(detail.concepts[0]).toMatchObject({ state: "gap", steps: ["incorrect"], n: 2 });
    expect(detail.latest?.lesson_title).toBe("O Império");
  });
});

describe("topicsOf", () => {
  it("groups the class's open gaps by topic, most students first, with the common origin and the open suggestions", () => {
    const a = gapsOf(dto([insight({ id: "g1", student_id: "s1" }), insight({ id: "sg1", kind: "suggestion", related_gap_id: "g1", student_id: "s1" })]));
    const b = gapsOf(dto([insight({ id: "g2", student_id: "s2", severity: "medium" }), insight({ id: "sg2", kind: "suggestion", related_gap_id: "g2", student_id: "s2", status: "accepted" })]));
    const c = gapsOf(dto([insight({ id: "g3", student_id: "s3", concept: "Pão e circo", severity: "critical", root_cause: null, material_ref: { lesson_id: "L4", pages: [7, 8] } })]));
    const topics = topicsOf([...c, ...a, ...b]);
    expect(topics.map((t) => t.concept)).toEqual(["Formas de governo", "Pão e circo"]);
    expect(topics[0]).toMatchObject({ studentIds: ["s1", "s2"], critical: true, origin: { title: "Cap. 1", pages: [1, 2] }, suggestionIds: ["sg1", "sg2"] });
    expect(topics[1]).toMatchObject({ origin: { title: null, pages: [7, 8] }, suggestionIds: [] });
  });
});
