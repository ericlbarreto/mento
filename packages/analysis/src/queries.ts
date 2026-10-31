import {
  sequenceOf,
  type ConversationSource,
  type Insight,
  type InsightStatus,
  type LearnerSummary,
  type Severity,
  type Student,
  type TeacherRepository,
} from "@mento/contracts";
import { SEVERITY_RANK } from "./rules";

const OPEN: InsightStatus[] = ["new", "accepted"];
const SEVERITIES: Severity[] = ["critical", "medium", "positive"];

const emptyBySeverity = () => ({ critical: 0, medium: 0, positive: 0 }) satisfies Record<Severity, number>;

/** Open gap + progress insights per severity (suggestions inherit their gap's severity and are not counted twice). */
function countOpen(insights: Insight[]) {
  const by = emptyBySeverity();
  for (const i of insights) if (i.kind !== "suggestion" && OPEN.includes(i.status)) by[i.severity] += 1;
  return by;
}

export async function getOverview(repo: TeacherRepository, conversations: ConversationSource) {
  const [students, sessions, insights] = await Promise.all([repo.listStudents(), conversations.listAllSessions(), repo.listInsights()]);
  const simulated = students.filter((s) => s.is_simulated).length;
  return {
    students: { total: students.length, real: students.length - simulated, simulated },
    conversations: sessions.length,
    insights: {
      total: insights.length,
      gaps_identified: insights.filter((i) => i.kind === "gap" && i.status !== "dismissed").length,
      gaps_open: insights.filter((i) => i.kind === "gap" && OPEN.includes(i.status)).length,
      by_severity: countOpen(insights),
    },
  };
}

export async function listStudentRows(repo: TeacherRepository, conversations: ConversationSource) {
  const [students, sessions, insights] = await Promise.all([repo.listStudents(), conversations.listAllSessions(), repo.listInsights()]);
  return students.map((s) => {
    const mine = sessions.filter((x) => x.student_id === s.id);
    const theirs = insights.filter((i) => i.student_id === s.id);
    return {
      id: s.id,
      name: s.name,
      is_simulated: s.is_simulated,
      class_name: s.profile?.class_name ?? null,
      grade_level: s.profile?.grade_level ?? null,
      conversations: mine.length,
      last_activity: mine.length > 0 ? mine[mine.length - 1]!.started_at : null,
      open_gaps: theirs.filter((i) => i.kind === "gap" && OPEN.includes(i.status)).length,
      insights: countOpen(theirs),
    };
  });
}

export async function getStudentSessions(repo: TeacherRepository, conversations: ConversationSource, studentId: string) {
  const [sessions, insights] = await Promise.all([conversations.listSessionsByStudent(studentId), repo.listInsights({ student_id: studentId })]);
  return Promise.all(
    sessions.map(async (s) => {
      const [material, analysis] = await Promise.all([s.material_id ? repo.getMaterial(s.material_id) : Promise.resolve(null), repo.getAnalysisBySession(s.id)]);
      const lesson = material ? sequenceOf(material).find((l) => l.lesson_id === s.lesson_id) : undefined;
      return {
        id: s.id,
        topic: s.topic ?? null,
        material_id: s.material_id,
        material_title: material?.title ?? null,
        lesson_id: s.lesson_id,
        lesson_title: lesson?.title ?? null,
        started_at: s.started_at,
        ended_at: s.ended_at ?? null,
        analysis_status: analysis?.status ?? null,
        insight_count: insights.filter((i) => i.session_id === s.id && i.kind !== "suggestion").length,
        // What the conversation was about, in the tutor's words (the concepts it checked), never the student's.
        concepts: [...new Set((analysis?.findings ?? []).map((f) => f.concept))],
        questions: analysis?.counters?.verifications ?? 0,
        correct: analysis?.counters?.correct ?? 0,
        incorrect: analysis?.counters?.incorrect ?? 0,
      };
    }),
  );
}

export async function getStudentDetail(repo: TeacherRepository, conversations: ConversationSource, student: Student) {
  const sessions = await getStudentSessions(repo, conversations, student.id);
  const insights = await repo.listInsights({ student_id: student.id });
  let latest: { session_id: string; summary: string; studying_lesson_id: string | null; studying_lesson_title: string | null; analyzed_at: string } | null = null;
  for (const s of [...sessions].reverse()) {
    const analysis = await repo.getAnalysisBySession(s.id);
    // Only an analysis that found something has a summary worth showing ("short conversation, no evidence" is not).
    if (analysis?.status === "done" && analysis.summary && analysis.findings.length > 0) {
      latest = {
        session_id: s.id,
        summary: analysis.summary,
        studying_lesson_id: analysis.studying_lesson_id,
        studying_lesson_title: s.lesson_title,
        analyzed_at: analysis.finished_at ?? analysis.updated_at,
      };
      break;
    }
  }
  return { student, conversations: sessions.length, insights: countOpen(insights), latest_analysis: latest };
}

export interface StudentInsights {
  student_id: string;
  counts: Record<Severity, number>;
  critical: Insight[];
  medium: Insight[];
  positive: Insight[];
}

/** The per-student insights table, grouped by severity (critical, medium, positive). */
export async function getStudentInsights(
  repo: TeacherRepository,
  studentId: string,
  filter: { severity?: Severity; status?: InsightStatus[] } = {},
): Promise<StudentInsights> {
  const all = await repo.listInsights({ student_id: studentId, ...(filter.severity ? { severity: filter.severity } : {}), ...(filter.status ? { status: filter.status } : {}) });
  const visible = filter.status ? all : all.filter((i) => i.status !== "dismissed");
  const out: StudentInsights = { student_id: studentId, counts: countOpen(visible), critical: [], medium: [], positive: [] };
  for (const s of SEVERITIES) out[s] = visible.filter((i) => i.severity === s);
  return out;
}

export async function listClassInsights(repo: TeacherRepository, filter: { severity?: Severity; status?: InsightStatus[]; student_id?: string } = {}) {
  const items = await repo.listInsights({ ...(filter.severity ? { severity: filter.severity } : {}), ...(filter.status ? { status: filter.status } : {}), ...(filter.student_id ? { student_id: filter.student_id } : {}) });
  const visible = filter.status ? items : items.filter((i) => i.status !== "dismissed");
  return {
    counts: countOpen(visible),
    critical: visible.filter((i) => i.severity === "critical"),
    medium: visible.filter((i) => i.severity === "medium"),
    positive: visible.filter((i) => i.severity === "positive"),
  };
}

/** Evidence per concept across conversations, with `n`; fewer than 3 attempts is "insufficient evidence". */
export async function getEvolution(conversations: ConversationSource, studentId: string) {
  const sessions = await conversations.listSessionsByStudent(studentId);
  const concepts = new Map<string, { concept: string; series: Map<string, { session_id: string; started_at: string; attempts: number; correct: number; partial: number; incorrect: number; independent_correct: number }> }>();
  for (const s of sessions) {
    const bundle = await conversations.getSessionBundle(s.id);
    for (const ev of [...(bundle?.evidence ?? [])].sort((a, b) => a.ts.localeCompare(b.ts))) {
      const entry = concepts.get(ev.concept_key) ?? { concept: ev.concept, series: new Map() };
      const point = entry.series.get(s.id) ?? { session_id: s.id, started_at: s.started_at, attempts: 0, correct: 0, partial: 0, incorrect: 0, independent_correct: 0 };
      point.attempts += 1;
      point[ev.result] += 1;
      if (ev.result === "correct" && ev.independent) point.independent_correct += 1;
      entry.series.set(s.id, point);
      concepts.set(ev.concept_key, entry);
    }
  }
  return [...concepts.entries()].map(([concept_key, { concept, series }]) => {
    const points = [...series.values()];
    const n = points.reduce((a, p) => a + p.attempts, 0);
    return { concept, concept_key, n, state: n < 3 ? ("insufficient_evidence" as const) : ("enough_evidence" as const), series: points };
  });
}

/**
 * For the tutor (Person 3): open gaps (most severe first, top 5) and recent progress (top 3).
 * Concepts and descriptions only: no name, profile or school history (BR-14).
 */
export async function getLearnerSummary(repo: TeacherRepository, studentId: string): Promise<LearnerSummary> {
  const insights = await repo.listInsights({ student_id: studentId });
  const gaps = insights
    .filter((i) => i.kind === "gap" && OPEN.includes(i.status))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.confidence - a.confidence)
    .slice(0, 5);
  const progress = insights.filter((i) => i.kind === "progress" && i.status !== "dismissed").slice(0, 3);
  return {
    open_gaps: gaps.map((g) => ({ concept: g.concept, concept_key: g.concept_key, description: g.body, confidence: g.confidence })),
    recent_progress: progress.map((p) => ({ concept: p.concept, description: p.body })),
  };
}
