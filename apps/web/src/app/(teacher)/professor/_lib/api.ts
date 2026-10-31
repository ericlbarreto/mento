// Owner: Person 1. Client of the teacher routes of the Fastify API. Every response is parsed with a schema.
import { API_URL, ApiError } from "../../../../lib/api";
import { ExerciseList } from "@mento/contracts";
import { ClassContext, EvolutionDto, Insight, InsightsDto, Overview, SessionDto, StudentDetailDto, StudentRowDto } from "./schemas";
import { z } from "zod";

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    // Only requests with a body declare JSON (a DELETE with content-type and no body is a 400 in Fastify).
    res = await fetch(new URL(`/api${path}`, API_URL), { ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  } catch {
    throw new ApiError(0, "api_unreachable", "Não foi possível falar com o servidor.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? "request_failed", `API ${res.status} em ${path}`);
  }
  return schema.parse(res.status === 204 ? null : await res.json());
}

const OPEN = "new,accepted";

export const teacherApi = {
  overview: () => request("/overview", Overview),
  students: () => request("/students", z.array(StudentRowDto)),
  studentDetail: (id: string) => request(`/students/${id}`, StudentDetailDto),
  studentSessions: (id: string) => request(`/students/${id}/sessions`, z.array(SessionDto)),
  studentEvolution: (id: string) => request(`/students/${id}/evolution`, EvolutionDto),
  studentInsights: (id: string, status = OPEN) => request(`/students/${id}/insights?status=${status}`, InsightsDto),
  classInsights: (status = OPEN) => request(`/insights?status=${status}`, InsightsDto),
  classContext: () => request("/class-context", ClassContext),
  saveClassContext: (value: ClassContext) => request("/class-context", ClassContext, { method: "PUT", body: JSON.stringify(value) }),
  decide: (id: string, status: "accepted" | "dismissed") => request(`/insights/${id}`, Insight, { method: "PATCH", body: JSON.stringify({ status }) }),
  exerciseLists: () => request("/exercise-lists", z.array(ExerciseList)),
  createExerciseList: (concept: string, gapIds: string[]) =>
    request("/exercise-lists", ExerciseList, { method: "POST", body: JSON.stringify({ concept, gap_ids: gapIds }) }),
  deleteExerciseList: (id: string) => request(`/exercise-lists/${id}`, z.null(), { method: "DELETE" }),
};

/** Live feed: calls `onChange` when an analysis finishes, an insight is created or an exercise list changes. Returns a cleanup function. */
export function watchTeacherStream(onChange: () => void): () => void {
  if (typeof EventSource === "undefined") return () => undefined;
  const source = new EventSource(new URL("/api/stream/teacher", API_URL).href);
  source.addEventListener("insight_created", onChange);
  source.addEventListener("analysis_status", onChange);
  source.addEventListener("exercise_list_status", onChange);
  return () => source.close();
}
