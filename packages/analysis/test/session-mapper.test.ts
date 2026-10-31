import { describe, expect, it } from "vitest";
import type { Material, StoredEvent, StoredEvidence, StoredSession } from "@mento/contracts";
import { buildAnalysisInput, computeFindings, toSessionBundle } from "../src";
import { LESSONS } from "./helpers";

/** Material with the lab's 8-lesson sequence: L2 = pages 20–25, L4 = 32–41, L6 = 48–55, L7 = 56–61. */
const material = (over: Partial<Material> = {}): Material => ({
  id: "mat1", title: "Apostila", subject: "history", is_fixture: false, file: null, pages: 68, status: "ready",
  progress: { stage: "done", done: 68, total: 68 }, chapters: [], sequence: LESSONS, pages_needing_ocr: [], toc_pages: [], passages: 10, error: null,
  created_at: "2026-10-30T00:00:00Z", updated_at: "2026-10-30T00:00:00Z", ...over,
});
const materials = (...ms: Material[]) => new Map(ms.map((m) => [m.id, m]));

const session: StoredSession = { id: "s1", student_id: "stu1", modality: "text", topic: "Roma", started_at: new Date("2026-10-30T13:00:00Z"), ended_at: new Date("2026-10-30T13:10:00Z"), end_reason: "user_left" };

let n = 0;
const ev = (type: string, payload: unknown): StoredEvent => ({ id: `e${++n}`, session_id: "s1", ts: new Date(Date.parse("2026-10-30T13:00:00Z") + n * 1000), type, payload });
const speak = (text: string, ...pages: number[]) => ev("tutor_action", { turn_id: "t1", action_id: `a${n}`, order: 0, name: "speak", args: { text, purpose: "explain", sources: pages.map((page) => ({ material_id: "mat1", page, quote: "q" })) } });
const asked = (id: string, concept: string) => ev("verification_asked", { verification_id: id, element_id: "q1", concept, concept_key: concept.toLowerCase(), question: "?", kind: "explain" });
const answered = (id: string, answer: string) => ev("verification_answered", { verification_id: id, element_id: "q1", answer });
const recorded = (evidenceId: string, verification_id: string) => ev("evidence_recorded", { evidence_id: evidenceId, verification_id, concept: "Formas de governo", concept_key: "formas de governo", result: "incorrect", independent: true, hints_used: 0, rationale: "r" });
const evidence = (id: string, over: Partial<StoredEvidence> = {}): StoredEvidence => ({
  id, session_id: "s1", student_id: "stu1", concept: "Formas de governo", concept_key: "formas de governo", result: "incorrect", independent: true, hints_used: 0,
  rationale: "r", citation: null, ts: new Date("2026-10-30T13:05:00Z"), ...over,
});

describe("stored conversations → analysis bundle (BR-27)", () => {
  it("BR-27 events keep their stored order with a seq; dates become ISO strings; the session reads as ended with its reason", () => {
    const events = [ev("session_started", { student_id: "stu1", modality: "text" }), ev("user_message", { kind: "chat", text: "oi" }), ev("session_ended", { reason: "user_left" })];
    const b = toSessionBundle({ session, events, evidence: [] }, materials());
    expect(b.events.map((e) => [e.seq, e.type])).toEqual([[1, "session_started"], [2, "user_message"], [3, "session_ended"]]);
    expect(b.events[0]!.ts).toMatch(/^2026-10-30T13:00:\d\d\.000Z$/);
    expect(b.session).toMatchObject({ id: "s1", student_id: "stu1", status: "ended", end_reason: "user_left", started_at: "2026-10-30T13:00:00.000Z", ended_at: "2026-10-30T13:10:00.000Z", topic: "Roma", is_simulated: false });
    const open = toSessionBundle({ session: { ...session, ended_at: null, end_reason: null }, events, evidence: [] }, materials());
    expect(open.session.status).toBe("active");
    expect(open.session.end_reason).toBeUndefined();
  });

  it("BR-27 the material is the one the tutor cited most, and the lesson is the lesson of the pages it cited most", () => {
    const events = [speak("a", 22), speak("b", 23, 50), speak("c", 24)];
    const b = toSessionBundle({ session, events, evidence: [] }, materials(material()));
    expect(b.session.material_id).toBe("mat1");
    expect(b.session.lesson_id).toBe("L2"); // three citations in pages 20–25 against one in 48–55
  });

  it("BR-27 on a tie in citations the lesson later in the book wins (going back is remediation); with several materials the most cited one wins", () => {
    const tie = toSessionBundle({ session, events: [speak("a", 22), speak("b", 50)], evidence: [] }, materials(material()));
    expect(tie.session.lesson_id).toBe("L6");
    const reversed = toSessionBundle({ session, events: [speak("a", 50), speak("b", 22)], evidence: [] }, materials(material()));
    expect(reversed.session.lesson_id).toBe("L6"); // the earlier lesson was cited last, but it is not the topic

    const other = material({ id: "mat2", title: "Outro" });
    const events = [
      ev("tutor_action", { args: { sources: [{ material_id: "mat2", page: 22, quote: "q" }] } }),
      speak("x", 50), speak("y", 51),
    ];
    const b = toSessionBundle({ session, events, evidence: [] }, materials(material(), other));
    expect(b.session.material_id).toBe("mat1");
    expect(b.session.lesson_id).toBe("L6");
  });

  it("BR-27 a conversation that cited nothing has no material and no lesson, and still produces a valid bundle", () => {
    const b = toSessionBundle({ session, events: [ev("user_message", { kind: "chat", text: "oi" })], evidence: [] }, materials(material()));
    expect(b.session.material_id).toBeNull();
    expect(b.session.lesson_id).toBeNull();
  });

  it("BR-27 citations of a material that no longer exists are ignored", () => {
    const b = toSessionBundle({ session, events: [speak("a", 22)], evidence: [] }, materials());
    expect(b.session.material_id).toBeNull();
  });

  it("BR-27 a book without a saved sequence (ingested by pnpm ingest) uses its chapters as lessons, each depending on the previous", () => {
    const book = material({ sequence: [], chapters: [{ title: "A República", start_page: 1, end_page: 100 }, { title: "O Império", start_page: 101, end_page: 200 }] });
    const b = toSessionBundle({ session, events: [speak("a", 150), speak("b", 160)], evidence: [evidence("ev1", { citation: { material_id: "mat1", page: 40, quote: "q" } })] }, materials(book));
    expect(b.session.lesson_id).toBe("L2");
    expect(b.evidence[0]!.lesson_id).toBe("L1");
  });

  it("BR-27 the lesson of an answer comes from the citation the judge validated", () => {
    const b = toSessionBundle({ session, events: [speak("a", 50)], evidence: [evidence("ev1", { citation: { material_id: "mat1", page: 22, quote: "q" } })] }, materials(material()));
    expect(b.evidence[0]).toMatchObject({ id: "ev1", lesson_id: "L2", citation: { page: 22 }, ts: "2026-10-30T13:05:00.000Z" });
  });

  it("BR-27 without a validated citation the lesson is what the tutor had just explained before asking the question", () => {
    const events = [speak("explica a república", 22), asked("v1", "Formas de governo"), answered("v1", "tem rei"), recorded("ev1", "v1"), speak("agora o império", 50), asked("v2", "Cidadania"), answered("v2", "todos"), recorded("ev2", "v2")];
    const b = toSessionBundle({ session, events, evidence: [evidence("ev1"), evidence("ev2", { concept: "Cidadania", concept_key: "cidadania" })] }, materials(material()));
    expect(b.evidence.map((e) => e.lesson_id)).toEqual(["L2", "L6"]);
  });

  it("BR-27 an answer whose lesson cannot be known stays null (never guessed), and evidence from another material has no lesson", () => {
    const b = toSessionBundle(
      { session, events: [speak("a", 22)], evidence: [evidence("ev1"), evidence("ev2", { citation: { material_id: "mat2", page: 22, quote: "q" } })] },
      materials(material(), material({ id: "mat2" })),
    );
    expect(b.evidence.map((e) => e.lesson_id)).toEqual([null, null]);
  });

  it("BR-27 the bundle feeds the analysis: two wrong answers about an earlier lesson become a critical gap with that lesson as root cause", () => {
    const events = [
      ev("session_started", { student_id: "stu1", modality: "text" }),
      ev("user_message", { kind: "chat", text: "como a república virou império?" }),
      speak("Augusto concentrou o poder", 50, 51),
      speak("Na república o poder era dividido", 22),
      asked("v1", "Formas de governo"), answered("v1", "na república o rei é eleito"), recorded("ev1", "v1"),
      asked("v2", "Formas de governo"), answered("v2", "o augusto era presidente"), recorded("ev2", "v2"),
      ev("session_ended", { reason: "user_left" }),
    ];
    const rows = [evidence("ev1", { ts: new Date("2026-10-30T13:04:00Z") }), evidence("ev2", { ts: new Date("2026-10-30T13:05:00Z") })];
    const bundle = toSessionBundle({ session, events, evidence: rows }, materials(material()));
    const input = buildAnalysisInput({ trigger: bundle, history: [bundle], material: material(), class_context: null });

    expect(input.studying_lesson_id).toBe("L6");
    const [finding] = computeFindings(input);
    expect(finding).toMatchObject({ concept_key: "formas de governo", rule: "R1_repeated_errors", severity: "critical", diagnosis: "prerequisite", root_cause: { lesson_id: "L2" } });
    expect(finding!.evidence.map((e) => e.quote)).toEqual(["na república o rei é eleito", "o augusto era presidente"]);
  });
});
