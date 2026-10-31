import { MemoryRepository } from "@mento/db";
import {
  normalizeConcept,
  RULES_VERSION,
  type AnalysisInput,
  type Counters,
  type EvidenceResult,
  type InputEvidence,
  type InputSession,
  type Lesson,
  type SessionBundle,
  type TeacherEvent,
} from "@mento/contracts";
import {
  AnalysisService,
  FileConversationSource,
  LAB_CONVERSATIONS_PATH,
  idMapsFromRepo,
  loadLabMaterial,
  seedLabMaterial,
  seedStudents,
  type AnalysisWriter,
} from "../src";

export const LESSONS: Lesson[] = loadLabMaterial().sequence;

/** Deterministic clock: each call is one second later. */
export function fakeClock(start = "2026-10-30T12:00:00.000Z") {
  let t = Date.parse(start);
  return () => new Date((t += 1000)).toISOString();
}

// ---- Pure AnalysisInput builders (rules / diagnosis tests) ----

let counter = 0;
export interface EvOpts { hints?: number; lesson?: string | null; answer?: string }

export function ev(concept: string, result: EvidenceResult, opts: EvOpts = {}): InputEvidence {
  counter += 1;
  const hints = opts.hints ?? 0;
  return {
    id: `evd_${counter}`, concept, concept_key: normalizeConcept(concept), lesson_id: opts.lesson === undefined ? null : opts.lesson,
    result, independent: hints === 0, hints_used: hints, rationale: "r", ts: `2026-10-0${(counter % 9) + 1}T10:00:00Z`,
    answer_event_id: `evt_${counter}`, answer: opts.answer ?? `resposta ${counter}`,
  };
}

export function sess(id: string, evidence: InputEvidence[], opts: { lesson?: string | null; messages?: number; started_at?: string } = {}): InputSession {
  const counters: Counters = {
    user_messages: opts.messages ?? 3, hints_given: evidence.reduce((a, e) => a + e.hints_used, 0), verifications: evidence.length,
    correct: evidence.filter((e) => e.result === "correct").length, partial: evidence.filter((e) => e.result === "partial").length,
    incorrect: evidence.filter((e) => e.result === "incorrect").length,
    independent_correct: evidence.filter((e) => e.result === "correct" && e.independent).length,
  };
  return {
    session_id: id, topic: null, lesson_id: opts.lesson ?? null, started_at: opts.started_at ?? id, counters, evidence,
    turns: evidence.flatMap((e) => (e.answer_event_id && e.answer ? [{ event_id: e.answer_event_id, role: "student" as const, text: e.answer }] : [])),
  };
}

/** Sessions are given oldest first; the last one is the trigger. */
export function input(sessions: InputSession[], opts: { studying?: string | null; sequence?: Lesson[] } = {}): AnalysisInput {
  const trigger = sessions[sessions.length - 1]!;
  return {
    student_id: "stu-test", trigger_session_id: trigger.session_id, studying_lesson_id: opts.studying === undefined ? null : opts.studying,
    rules_version: RULES_VERSION, class_context: { grade_level: "8º ano", description: "d" },
    material: { id: "mat", title: "Apostila", subject: "História", sequence: opts.sequence ?? LESSONS },
    skip_reason: trigger.counters.user_messages < 2 && trigger.evidence.length === 0 ? "short_session" : null,
    sessions,
  };
}

// ---- SessionBundle builder (service tests with their own conversations) ----

export interface VerifySpec { concept: string; lesson?: string; result: EvidenceResult; answer: string; hints?: number }

export function makeBundle(args: {
  id: string; student_id: string; material_id: string; lesson_id?: string | null; started_at: string; messages?: number; verifications?: VerifySpec[];
}): SessionBundle {
  const events: SessionBundle["events"] = [];
  const evidence: SessionBundle["evidence"] = [];
  const t0 = Date.parse(args.started_at);
  const push = <T extends SessionBundle["events"][number]>(e: Omit<T, "id" | "session_id" | "seq" | "ts">) => {
    const seq = events.length + 1;
    const full = { ...e, id: `${args.id}_e${seq}`, session_id: args.id, seq, ts: new Date(t0 + seq * 20_000).toISOString() } as SessionBundle["events"][number];
    events.push(full);
    return full;
  };
  push({ type: "session_started", payload: { student_id: args.student_id, material_id: args.material_id, lesson_id: args.lesson_id ?? null, modality: "text" } });
  for (let i = 0; i < (args.messages ?? 2); i++) push({ type: "user_message", payload: { kind: "chat", text: `mensagem ${i + 1}` } });
  (args.verifications ?? []).forEach((v, i) => {
    const vid = `ver_${args.id}_${i}`;
    const key = normalizeConcept(v.concept);
    push({ type: "verification_asked", payload: { verification_id: vid, element_id: `el${i}`, concept: v.concept, concept_key: key, lesson_id: v.lesson ?? null, question: "pergunta?", kind: "open" } });
    for (let h = 0; h < (v.hints ?? 0); h++) push({ type: "hint_given", payload: { turn_id: "t", level: 1, verification_id: vid, concept_key: key } });
    const answered = push({ type: "verification_answered", payload: { verification_id: vid, element_id: `el${i}`, answer: v.answer } });
    const evidenceId = `evd_${args.id}_${i}`;
    evidence.push({
      id: evidenceId, session_id: args.id, student_id: args.student_id, concept: v.concept, concept_key: key, lesson_id: v.lesson ?? null,
      result: v.result, independent: (v.hints ?? 0) === 0, hints_used: v.hints ?? 0, rationale: "r", ts: answered.ts,
    });
    push({ type: "evidence_recorded", payload: { evidence_id: evidenceId, verification_id: vid, concept: v.concept, concept_key: key, result: v.result, independent: (v.hints ?? 0) === 0, hints_used: v.hints ?? 0, rationale: "r" } });
  });
  const ended = push({ type: "session_ended", payload: { reason: "user_left" } });
  return {
    session: {
      id: args.id, student_id: args.student_id, material_id: args.material_id, lesson_id: args.lesson_id ?? null, modality: "text", status: "ended",
      started_at: args.started_at, ended_at: ended.ts, end_reason: "user_left", is_simulated: true,
    },
    events,
    evidence,
  };
}

// ---- The lab world: mocked students + lab material in a memory repository + the lab conversations from the JSON file ----

export async function labWorld(options: { writer?: AnalysisWriter } = {}) {
  const repo = new MemoryRepository({ now: fakeClock() });
  const students = await seedStudents(repo);
  const material = await seedLabMaterial(repo);
  const conversations = new FileConversationSource(LAB_CONVERSATIONS_PATH, idMapsFromRepo(repo));
  const events: TeacherEvent[] = [];
  const service = new AnalysisService({ repo, conversations, writer: options.writer, now: fakeClock("2026-11-01T00:00:00.000Z"), emit: (e) => events.push(e) });
  const studentId = (fixture: string) => students.find((s) => s.fixture_id === fixture)!.id;
  return { repo, conversations, service, events, material, students, studentId };
}
export type LabWorld = Awaited<ReturnType<typeof labWorld>>;

/** Analyze every lab conversation in chronological order, like `seed:lab --analyze`. */
export async function analyzeAll(world: LabWorld) {
  for (const s of await world.conversations.listAllSessions()) await world.service.run(s.id);
}

/** Compact, id-free view of a student's insights for assertions. */
export async function view(world: LabWorld, fixture: string) {
  const all = await world.repo.listInsights({ student_id: world.studentId(fixture) });
  return all
    .map((i) => ({ kind: i.kind, concept_key: i.concept_key, severity: i.severity, rule: i.rule, status: i.status, diagnosis: i.diagnosis, root: i.root_cause?.lesson_id ?? null }))
    .sort((a, b) => (a.kind + a.concept_key < b.kind + b.concept_key ? -1 : 1));
}
