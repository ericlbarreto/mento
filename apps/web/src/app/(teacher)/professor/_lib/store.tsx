"use client";
// Owner: Person 1. The teacher workspace. Two providers behind the same `useTeacher()`:
// - API (default): students, class context, insights and per-student detail come from the teacher API, refreshed by the SSE feed.
// - Mock (NEXT_PUBLIC_MOCK_API=1): the fictional workspace, so the UI runs with no server.
// The class-wide topics and interventions are built from the real open gaps (D71). Still mock in both modes: Materials.
import type { ExerciseList, UpdateExerciseListBody } from "@mento/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MOCK_API } from "../../../../lib/api";
import { teacherApi, watchTeacherStream } from "./api";
import { buildStudentDetail, gapsOf } from "./map";
import { MOCK_CLASS_CONTEXT, MOCK_GAPS, MOCK_MATERIALS, MOCK_SESSIONS, MOCK_STUDENTS } from "./mock";
import type { InsightsDto, StudentRowDto } from "./schemas";
import type { ClassContext, ConceptRow, Gap, GradeLevel, Material, Student, StudentDetail, Suggestion } from "./types";

export interface StudentRow extends Student {
  conversations: number;
  last_activity: string | null;
  /** Open gaps, most severe first. */
  gaps: Gap[];
}

/** The numbers in the cards at the top of the Students tab. */
export interface ClassStats {
  students: number;
  withConversations: number;
  simulatedStudents: number;
  concepts: number;
  gapsOpen: number;
  studentsWithGaps: number;
  suggestions: number;
}

interface TeacherStore {
  mode: "api" | "mock";
  loading: boolean;
  /** Set when the server could not be reached or answered with an error. */
  error: string | null;
  reload(): void;
  /** Bumps when a refresh brings new data, so detail screens know to refetch. */
  version: number;
  students: Student[];
  rows: StudentRow[];
  stats: ClassStats;
  classContext: ClassContext;
  saveClassContext(value: ClassContext): Promise<void>; // PUT /class-context
  /** Accept or dismiss one insight of the analysis. */
  decide(insightId: string, status: "accepted" | "dismissed"): Promise<void>; // PATCH /insights/:id
  /** The same decision on several insights at once (an intervention covers the suggestions of several students). */
  decideMany(insightIds: string[], status: "accepted" | "dismissed"): Promise<void>;
  /** Open gaps of the whole class, most severe first, each with its suggestion. */
  gaps: Gap[];
  /** Generated exercise lists, newest first (D72). */
  exerciseLists: ExerciseList[];
  /** False in mock mode: lists are written by Claude through the API. */
  exercisesAvailable: boolean;
  generateExercises(concept: string, gapIds: string[]): Promise<void>; // POST /exercise-lists
  updateExerciseList(id: string, body: UpdateExerciseListBody): Promise<void>; // PATCH /exercise-lists/:id (D81)
  deleteExerciseList(id: string): Promise<void>; // DELETE /exercise-lists/:id
  materials: Material[];
  // POST /materials (multipart): the real call must also send the teacher's single `subject_id` (D64, D67).
  uploadMaterial(input: { title: string; file: File }): Promise<Material>;
  // Student detail: mock mode reads it from here; API mode fetches it (see useStudentDetail).
  mockDetail(id: string): StudentDetail;
}

const Ctx = createContext<TeacherStore | null>(null);

/** Counts pages from the PDF bytes (`/Type /Page` objects). Good enough for the mock; the API extracts it. */
async function countPages(file: File) {
  const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
  return (text.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

/** Materials stay mock in both modes (out of scope for this round). */
function useMaterialsMock() {
  const [materials, setMaterials] = useState(MOCK_MATERIALS);
  return {
    materials,
    async uploadMaterial({ title, file }: { title: string; file: File }) {
      const material: Material = {
        id: `mat_${Date.now()}`,
        title,
        pages: await countPages(file),
        status: "processing",
        created_at: new Date().toISOString(),
        // Typed as PDF whatever the browser guessed, so the iframe never renders it as HTML.
        file_url: URL.createObjectURL(new Blob([file], { type: "application/pdf" })),
      };
      setMaterials((list) => [material, ...list]);
      // The API ingests in the background; the mock just flips to ready.
      setTimeout(() => setMaterials((list) => list.map((m) => (m.id === material.id ? { ...m, status: "ready" } : m))), 2500);
      return material;
    },
  };
}

const bySeverity = (a: Gap, b: Gap) => Number(b.severity === "critical") - Number(a.severity === "critical") || b.confidence - a.confidence;

function statsOf(rows: StudentRow[], concepts: number, suggestions: number): ClassStats {
  const gapsOpen = rows.reduce((n, r) => n + r.gaps.length, 0);
  return {
    students: rows.length,
    withConversations: rows.filter((r) => r.conversations > 0).length,
    simulatedStudents: rows.filter((r) => r.is_simulated).length,
    concepts,
    gapsOpen,
    studentsWithGaps: rows.filter((r) => r.gaps.length > 0).length,
    suggestions,
  };
}

// ---------------------------------------------------------------- mock provider

/** In mock mode every gap gets a "review these pages" suggestion, as the analysis' template writer does. */
function mockSuggestion(g: Gap, status: Suggestion["status"]): Suggestion | null {
  if (!g.material_ref) return null;
  const [from, to] = g.material_ref.pages;
  return {
    id: `sug_${g.id}`,
    title: `Retomar “${g.concept}”`,
    body: `Revisar as páginas ${from}–${to} do livro, com foco em “${g.concept}”.`,
    material_ref: { lesson_id: "L?", pages: g.material_ref.pages },
    status,
  };
}

function MockProvider({ children }: { children: React.ReactNode }) {
  const materials = useMaterialsMock();
  const [gapState, setGapState] = useState(MOCK_GAPS);
  const [suggestionStatus, setSuggestionStatus] = useState<Record<string, Suggestion["status"]>>({});

  const value = useMemo<TeacherStore>(() => {
    const open = gapState
      .filter((g) => g.status === "open")
      .map((g) => {
        const suggestion = mockSuggestion(g, suggestionStatus[`sug_${g.id}`] ?? "new");
        return { ...g, suggestion: suggestion?.status === "dismissed" ? null : suggestion };
      })
      .sort(bySeverity);
    const rows: StudentRow[] = MOCK_STUDENTS.map((s) => {
      const mine = MOCK_SESSIONS.filter((x) => x.student_id === s.id);
      return { ...s, conversations: mine.length, last_activity: mine.at(-1)?.started_at ?? null, gaps: open.filter((g) => g.student_id === s.id) };
    });
    const decide = async (id: string, status: "accepted" | "dismissed") => {
      if (id.startsWith("sug_")) setSuggestionStatus((all) => ({ ...all, [id]: status }));
      else setGapState((list) => list.map((g) => (g.id === id ? (status === "dismissed" ? { ...g, status: "resolved" } : { ...g, accepted: true }) : g)));
    };
    return {
      mode: "mock",
      loading: false,
      error: null,
      reload() {},
      version: 0,
      students: MOCK_STUDENTS,
      rows,
      stats: statsOf(rows, new Set(open.map((g) => g.concept)).size, open.filter((g) => g.suggestion?.status === "new").length),
      classContext: MOCK_CLASS_CONTEXT,
      async saveClassContext() {},
      decide,
      async decideMany(ids, status) {
        await Promise.all(ids.map((id) => decide(id, status)));
      },
      gaps: open,
      exerciseLists: [],
      exercisesAvailable: false,
      async generateExercises() {},
      async updateExerciseList() {},
      async deleteExerciseList() {},
      ...materials,
      mockDetail(id) {
        const sessions = MOCK_SESSIONS.filter((s) => s.student_id === id).reverse();
        const mine = open.filter((g) => g.student_id === id);
        const concepts: ConceptRow[] = mine.map((g) => ({
          concept_key: g.concept.toLowerCase(),
          concept: g.concept,
          n: g.attempts,
          steps: Array.from({ length: Math.min(g.attempts, 4) }, () => "incorrect" as const),
          state: "gap",
        }));
        // No summary in mock mode: only an analysis saved by the API has one.
        return { sessions, gaps: mine, resolved: [], progress: [], concepts, latest: null };
      },
    };
  }, [gapState, suggestionStatus, materials]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ---------------------------------------------------------------- API provider

interface Loaded {
  rows: StudentRowDto[];
  insights: InsightsDto;
  classContext: ClassContext;
  exerciseLists: ExerciseList[];
}

const EMPTY_CONTEXT: ClassContext = { grade_level: "8º ano", description: "" };

function ApiProvider({ children }: { children: React.ReactNode }) {
  const materials = useMaterialsMock();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const alive = useRef(true);
  const lastKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, insights, classContext, exerciseLists] = await Promise.all([
        teacherApi.students(),
        teacherApi.classInsights(),
        teacherApi.classContext().catch(() => EMPTY_CONTEXT),
        teacherApi.exerciseLists().catch(() => [] as ExerciseList[]),
      ]);
      if (!alive.current) return;
      setData({ rows, insights, classContext, exerciseLists });
      setError(null);
      // Detail screens refetch only when something changed after the first load (not on every poll).
      const key = JSON.stringify([rows, insights]);
      if (lastKey.current !== null && lastKey.current !== key) setVersion((v) => v + 1);
      lastKey.current = key;
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : "Erro ao carregar os dados.");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const stop = watchTeacherStream(() => void load());
    const poll = setInterval(() => document.visibilityState === "visible" && void load(), 20_000); // fallback when SSE is not delivered
    return () => {
      alive.current = false;
      stop();
      clearInterval(poll);
    };
  }, [load]);

  const value = useMemo<TeacherStore>(() => {
    const items = data ? [...data.insights.critical, ...data.insights.medium, ...data.insights.positive] : [];
    const gaps = data ? gapsOf(data.insights) : [];
    const rows: StudentRow[] = (data?.rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      is_simulated: r.is_simulated,
      class_name: r.class_name,
      grade_level: r.grade_level as GradeLevel | null,
      conversations: r.conversations,
      last_activity: r.last_activity,
      gaps: gaps.filter((g) => g.student_id === r.id),
    }));
    return {
      mode: "api",
      loading: data === null && error === null,
      error,
      reload: () => void load(),
      version,
      students: rows,
      rows,
      stats: statsOf(rows, new Set(items.map((i) => i.concept_key)).size, items.filter((i) => i.kind === "suggestion" && i.status === "new").length),
      classContext: data?.classContext ?? EMPTY_CONTEXT,
      async saveClassContext(value) {
        const saved = await teacherApi.saveClassContext(value);
        setData((d) => (d ? { ...d, classContext: saved } : d));
      },
      async decide(id, status) {
        await teacherApi.decide(id, status);
        await load();
      },
      async decideMany(ids, status) {
        await Promise.all(ids.map((id) => teacherApi.decide(id, status)));
        await load();
      },
      gaps,
      exerciseLists: data?.exerciseLists ?? [],
      exercisesAvailable: true,
      async generateExercises(concept, gapIds) {
        const created = await teacherApi.createExerciseList(concept, gapIds);
        // Show "generating" at once; the feed (or the poll) brings the finished list.
        setData((d) => (d ? { ...d, exerciseLists: [created, ...d.exerciseLists.filter((l) => l.id !== created.id)] } : d));
      },
      async updateExerciseList(id, body) {
        const saved = await teacherApi.updateExerciseList(id, body);
        setData((d) => (d ? { ...d, exerciseLists: d.exerciseLists.map((l) => (l.id === id ? saved : l)) } : d));
      },
      async deleteExerciseList(id) {
        await teacherApi.deleteExerciseList(id);
        setData((d) => (d ? { ...d, exerciseLists: d.exerciseLists.filter((l) => l.id !== id) } : d));
      },
      ...materials,
      mockDetail: () => ({ sessions: [], gaps: [], resolved: [], progress: [], concepts: [], latest: null }),
    };
  }, [data, error, version, load, materials]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function TeacherStoreProvider({ children }: { children: React.ReactNode }) {
  return MOCK_API ? <MockProvider>{children}</MockProvider> : <ApiProvider>{children}</ApiProvider>;
}

export function useTeacher() {
  const store = useContext(Ctx);
  if (!store) throw new Error("useTeacher outside TeacherStoreProvider");
  return store;
}

export interface StudentDetailState {
  loading: boolean;
  error: string | null;
  detail: StudentDetail | null;
}

/** Everything the student page shows. Fetched from the API (and refetched when the feed reports news); computed in mock mode. */
export function useStudentDetail(id: string): StudentDetailState {
  const store = useTeacher();
  const [state, setState] = useState<StudentDetailState>({ loading: true, error: null, detail: null });
  const { mode, version, mockDetail } = store;

  useEffect(() => {
    if (mode === "mock") return;
    let cancelled = false;
    (async () => {
      try {
        const [detail, sessions, open, resolved, evolution] = await Promise.all([
          teacherApi.studentDetail(id),
          teacherApi.studentSessions(id),
          teacherApi.studentInsights(id),
          teacherApi.studentInsights(id, "resolved"),
          teacherApi.studentEvolution(id),
        ]);
        if (!cancelled) setState({ loading: false, error: null, detail: buildStudentDetail({ studentId: id, sessions, detail, open, resolved, evolution }) });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Erro ao carregar o aluno." }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, mode, version]);

  if (mode === "mock") return { loading: false, error: null, detail: mockDetail(id) };
  return state;
}

