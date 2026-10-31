import {
  InsightStatus,
  normalizeConcept,
  type Analysis,
  type ClassContext,
  type CreateStudentBody,
  type Insight,
  type Severity,
  type Student,
} from "@mento/contracts";
import {
  getEvolution,
  getOverview,
  getStudentDetail,
  getStudentInsights,
  getStudentSessions,
  listClassInsights,
  listStudentRows,
} from "@mento/analysis";
import type { Container } from "../container";
import { badRequest, conflict, notFound, unprocessable } from "../lib/errors";

/** Controllers: plain async functions (container + parsed input in, data out). No business logic here: see @mento/analysis. */

export const getOverviewData = (c: Container) => getOverview(c.teacherRepo, c.conversations);
export const getStudentRows = (c: Container) => listStudentRows(c.teacherRepo, c.conversations);

export async function createStudent(c: Container, body: CreateStudentBody): Promise<Student> {
  return c.teacherRepo.upsertStudent({ name: body.name, ...(body.profile ? { profile: body.profile } : {}), is_simulated: false });
}

async function requireStudent(c: Container, id: string): Promise<Student> {
  return (await c.teacherRepo.getStudent(id)) ?? Promise.reject(notFound("student"));
}

export async function getStudentData(c: Container, id: string) {
  return getStudentDetail(c.teacherRepo, c.conversations, await requireStudent(c, id));
}

/** `status` arrives as a comma-separated query value (`new,accepted`). */
export function parseStatuses(raw: string | undefined): Insight["status"][] | undefined {
  if (!raw) return undefined;
  const parsed = InsightStatus.array().safeParse(raw.split(",").map((s) => s.trim()).filter(Boolean));
  if (!parsed.success) throw badRequest(`invalid status: ${raw}`);
  return parsed.data;
}

export async function getStudentInsightsData(c: Container, id: string, filter: { severity?: Severity | undefined; status?: string | undefined }) {
  await requireStudent(c, id);
  const status = parseStatuses(filter.status);
  return getStudentInsights(c.teacherRepo, id, { ...(filter.severity ? { severity: filter.severity } : {}), ...(status ? { status } : {}) });
}

export async function getStudentEvolution(c: Container, id: string) {
  await requireStudent(c, id);
  return getEvolution(c.conversations, id);
}

export async function getStudentSessionList(c: Container, id: string) {
  await requireStudent(c, id);
  return getStudentSessions(c.teacherRepo, c.conversations, id);
}

export async function getClassInsights(c: Container, filter: { severity?: Severity | undefined; status?: string | undefined; student_id?: string | undefined }) {
  const status = parseStatuses(filter.status);
  return listClassInsights(c.teacherRepo, {
    ...(filter.severity ? { severity: filter.severity } : {}),
    ...(status ? { status } : {}),
    ...(filter.student_id ? { student_id: filter.student_id } : {}),
  });
}

/** The teacher decides (principle 8): accept or dismiss. Dismissing a gap also dismisses its open suggestion. */
export async function decideInsight(c: Container, id: string, status: "accepted" | "dismissed"): Promise<Insight> {
  const insight = await c.teacherRepo.getInsight(id);
  if (!insight) throw notFound("insight");
  if (insight.status === "resolved") throw conflict("a resolved insight can no longer be changed");
  const updated = await c.teacherRepo.updateInsight(id, { status });
  if (status === "dismissed" && insight.kind === "gap") {
    for (const s of await c.teacherRepo.listInsights({ student_id: insight.student_id, kind: "suggestion" })) {
      if (s.related_gap_id === id && (s.status === "new" || s.status === "accepted")) await c.teacherRepo.updateInsight(s.id, { status: "dismissed" });
    }
  }
  return updated!;
}

export async function getClassContextData(c: Container): Promise<ClassContext> {
  return (await c.teacherRepo.getClassContext()) ?? Promise.reject(notFound("class context"));
}

/** The description is read by the tutor on every chat, so it must not name students (docs/06). */
export async function putClassContext(c: Container, body: ClassContext): Promise<ClassContext> {
  const text = ` ${normalizeConcept(body.description)} `;
  for (const s of await c.teacherRepo.listStudents()) {
    const first = normalizeConcept(s.name.split(" ")[0] ?? "");
    for (const name of [normalizeConcept(s.name), first.length >= 3 ? first : ""]) {
      if (name && text.includes(` ${name} `)) throw unprocessable("a descrição da turma não deve conter nomes de alunos");
    }
  }
  return c.teacherRepo.setClassContext(body);
}

export async function getAnalysisData(c: Container, sessionId: string): Promise<Analysis> {
  return (await c.teacherRepo.getAnalysisBySession(sessionId)) ?? Promise.reject(notFound("analysis"));
}

const orNotFound = async <T>(work: Promise<T>): Promise<T> => {
  try {
    return await work;
  } catch (err) {
    if ((err as { code?: string }).code === "not_found") throw notFound((err as Error).message.replace(/ not found$/, ""));
    throw err;
  }
};

/** Marks the analysis pending and runs it in the background (HTTP 202). */
export const startAnalysis = (c: Container, sessionId: string, force: boolean) => orNotFound(c.analysis.start(sessionId, { force }));

/** Runs the analysis now and returns the result (`POST /dev/analyze/:sessionId`). */
export async function runAnalysis(c: Container, sessionId: string) {
  const { analysis, cached, insights } = await orNotFound(c.analysis.run(sessionId, { force: true }));
  return { analysis, cached, insights_touched: insights.length };
}
