import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import {
  MongoConversationReader,
  MongoEvidenceStore,
  MongoRepository,
  MongoTurnRepository,
  connectMongo,
  disconnectMongo,
} from "@mento/db";
import { AnalysisService, MongoConversationSource, getStudentInsights, getStudentSessions } from "../src";
import { mongoTestUri } from "./mongo-env";
import { LESSONS } from "./helpers";

const uri = mongoTestUri();
const DB = "mento_test_analysis_flow"; // its own database: the other integration file drops its own in parallel

describe.skipIf(!uri)("analysis of conversations stored by the whiteboard on MongoDB (database mento_test_analysis_flow)", () => {
  const teacher = new MongoRepository();
  const tutor = new MongoTurnRepository(); // Eric's repository: exactly what the tutor writes
  const evidenceStore = new MongoEvidenceStore();

  beforeAll(async () => {
    await connectMongo(uri!, { dbName: DB });
    await mongoose.connection.dropDatabase();
    await teacher.syncIndexes();
  }, 60_000);
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
  }, 30_000);

  /** One conversation written the way the tutor and the judge write it (turn engine, action pipeline, Claude judge). */
  async function converse(args: { student_id: string; material_id: string; topic: string; answers: { concept: string; answer: string; lesson_page: number; result: "correct" | "incorrect"; hints?: number }[]; studyingPage: number }) {
    const { id } = await tutor.createSession({ student_id: args.student_id, modality: "text", topic: args.topic });
    const cite = (page: number) => ({ material_id: args.material_id, page, quote: "trecho do livro" });
    await tutor.appendEvent(id, { type: "user_message", payload: { kind: "chat", text: `quero entender ${args.topic}` } });
    await tutor.appendEvent(id, { type: "tutor_action", payload: { turn_id: "turn_1", action_id: "act_1_0", order: 0, name: "speak", args: { text: `Vamos falar de ${args.topic}.`, purpose: "explain", sources: [cite(args.studyingPage), cite(args.studyingPage + 1)] } } });
    let n = 0;
    for (const a of args.answers) {
      n += 1;
      const verification_id = `ver_${id}_${n}`;
      const concept_key = a.concept.toLowerCase();
      await tutor.appendEvent(id, { type: "tutor_action", payload: { turn_id: `turn_${n + 1}`, action_id: `act_${n + 1}_0`, order: 0, name: "speak", args: { text: `Antes: ${a.concept}.`, purpose: "explain", sources: [cite(a.lesson_page)] } } });
      await tutor.appendEvent(id, { type: "verification_asked", payload: { verification_id, element_id: "q1", concept: a.concept, concept_key, question: `Explique ${a.concept}?`, kind: "explain" } });
      for (let h = 0; h < (a.hints ?? 0); h++) await tutor.appendEvent(id, { type: "hint_given", payload: { turn_id: `turn_${n + 1}`, level: 1, verification_id, concept_key } });
      await tutor.appendEvent(id, { type: "verification_answered", payload: { verification_id, element_id: "q1", answer: a.answer } });
      // the judge: evidence row first, then the event that points to it
      const { id: evidence_id } = await evidenceStore.insertEvidence({ session_id: id, student_id: args.student_id, concept: a.concept, concept_key, result: a.result, independent: !a.hints, hints_used: a.hints ?? 0, rationale: "avaliação do juiz" });
      await tutor.appendEvent(id, { type: "evidence_recorded", payload: { evidence_id, verification_id, concept: a.concept, concept_key, result: a.result, independent: !a.hints, hints_used: a.hints ?? 0, rationale: "avaliação do juiz" } });
    }
    await tutor.endSession(id, "user_left");
    return id;
  }

  it("BR-28 a conversation stored by the tutor is analysed: a critical gap whose root cause is the earlier lesson, with the student's own words", async () => {
    const student = await teacher.upsertStudent({ name: "Aluna de Teste", is_simulated: true });
    const material = await teacher.upsertMaterial({ title: "Apostila", subject: "history", status: "ready", pages: 68, sequence: LESSONS, chapters: LESSONS.map((l) => ({ title: l.title, start_page: l.pages[0], end_page: l.pages[1] })) });
    const source = new MongoConversationSource(teacher, new MongoConversationReader());
    const service = new AnalysisService({ repo: teacher, conversations: source });

    const first = await converse({
      student_id: student.id, material_id: material.id, topic: "a crise da República", studyingPage: 49,
      answers: [
        { concept: "Formas de governo", answer: "na república o rei é eleito", lesson_page: 22, result: "incorrect" },
        { concept: "Formas de governo", answer: "o augusto virou presidente da república", lesson_page: 23, result: "incorrect" },
      ],
    });

    // what the analysis sees comes straight from the stored documents
    const bundle = (await source.getSessionBundle(first))!;
    expect(bundle.session).toMatchObject({ id: first, student_id: student.id, material_id: material.id, lesson_id: "L6", status: "ended", end_reason: "user_left" });
    expect(bundle.events.map((e) => e.seq)).toEqual(bundle.events.map((_, i) => i + 1));
    expect(bundle.events.at(-1)!.type).toBe("session_ended");
    expect(bundle.evidence.map((e) => [e.result, e.lesson_id])).toEqual([["incorrect", "L2"], ["incorrect", "L2"]]);

    const { analysis, cached } = await service.run(first);
    expect(cached).toBe(false);
    expect(analysis).toMatchObject({ status: "done", studying_lesson_id: "L6", skip_reason: null });
    expect(analysis.summary).toContain("Formas de governo");

    const insights = await getStudentInsights(teacher, student.id);
    const gap = insights.critical.find((i) => i.kind === "gap")!;
    expect(gap).toMatchObject({ concept_key: "formas de governo", rule: "R1_repeated_errors", diagnosis: "prerequisite", root_cause: { lesson_id: "L2", taught_in_class: true } });
    expect(gap.evidence.map((e) => e.quote)).toEqual(["na república o rei é eleito", "o augusto virou presidente da república"]);
    expect(insights.critical.some((i) => i.kind === "suggestion" && i.related_gap_id === gap.id)).toBe(true);

    // a second stored conversation escalates the same gap instead of duplicating it
    const second = await converse({
      student_id: student.id, material_id: material.id, topic: "Augusto e o Império", studyingPage: 50,
      answers: [{ concept: "Formas de governo", answer: "ele era um tipo de presidente", lesson_page: 22, result: "incorrect" }],
    });
    await service.run(second);
    const after = await getStudentInsights(teacher, student.id);
    expect(after.critical.filter((i) => i.kind === "gap")).toHaveLength(1);
    expect(after.critical.find((i) => i.kind === "gap")).toMatchObject({ id: gap.id, rule: "R3_recurring" });

    // the teacher screens read the same stored sessions
    const sessions = await getStudentSessions(teacher, source, student.id);
    expect(sessions.map((s) => [s.id, s.lesson_id, s.analysis_status])).toEqual([[first, "L6", "done"], [second, "L6", "done"]]);
    expect(sessions[0]!.lesson_title).toContain("Crise da República");
  }, 60_000);

  it("BR-28 a stored conversation with no verification and no sources still analyses cleanly (nothing to conclude)", async () => {
    const student = await teacher.upsertStudent({ name: "Aluno Sem Perguntas", is_simulated: true });
    const { id } = await tutor.createSession({ student_id: student.id, modality: "voice" });
    await tutor.appendEvent(id, { type: "user_message", payload: { kind: "speech", text: "oi" } });
    await tutor.endSession(id, "idle_timeout");
    const source = new MongoConversationSource(teacher, new MongoConversationReader());
    const bundle = (await source.getSessionBundle(id))!;
    expect(bundle.session).toMatchObject({ material_id: null, lesson_id: null, modality: "voice", end_reason: "idle_timeout" });
    const { analysis } = await new AnalysisService({ repo: teacher, conversations: source }).run(id);
    expect(analysis).toMatchObject({ status: "done", skip_reason: "short_session", findings: [] });
  }, 30_000);

  it("BR-28 unknown, malformed and foreign ids give nothing", async () => {
    const source = new MongoConversationSource(teacher, new MongoConversationReader());
    expect(await source.getSessionBundle("not-an-id")).toBeNull();
    expect(await source.getSessionBundle("000000000000000000000000")).toBeNull();
    expect(await source.listSessionsByStudent("nobody")).toEqual([]);
  });
});
