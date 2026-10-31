"use client";
// Owner: Person 1. In-memory teacher workspace (mock). Each action notes the teacher API route it will call,
// so wiring the real API later only replaces the bodies here.
import { createContext, useContext, useMemo, useState } from "react";
import { MOCK_CLASS_CONTEXT, MOCK_GAPS, MOCK_INSIGHTS, MOCK_INTERVENTIONS, MOCK_MATERIALS, MOCK_SESSIONS, MOCK_STUDENTS } from "./mock";
import { mockExerciseSet } from "./exercises";
import type { ClassContext, ClassInsight, ExerciseSet, Gap, Intervention, InterventionStatus, Material, SessionItem, Student } from "./types";

export interface StudentRow extends Student {
  conversations: number;
  last_activity: string | null;
  gaps: Gap[];
}

interface TeacherStore {
  students: Student[];
  sessions: SessionItem[];
  gaps: Gap[];
  insights: ClassInsight[];
  interventions: Intervention[];
  materials: Material[];
  classContext: ClassContext;
  rows: StudentRow[];
  /** Exercise list per intervention id; "generating" while the request runs. */
  exerciseSets: Record<string, ExerciseSet | "generating">;
  setInterventionStatus(id: string, status: InterventionStatus): void; // PATCH /interventions/:id (to agree with Person 1)
  generateExercises(interventionId: string): void; // POST /interventions/:id/exercises (to agree on)
  // POST /materials (multipart): the real call must also send the teacher's single `subject_id` (D64, D67).
  uploadMaterial(input: { title: string; file: File }): Promise<Material>;
}

const Ctx = createContext<TeacherStore | null>(null);

/** Counts pages from the PDF bytes (`/Type /Page` objects). Good enough for the mock; the API extracts it. */
async function countPages(file: File) {
  const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
  return (text.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

export function TeacherStoreProvider({ children }: { children: React.ReactNode }) {
  const students = MOCK_STUDENTS;
  const sessions = MOCK_SESSIONS;
  const gaps = MOCK_GAPS;
  const insights = MOCK_INSIGHTS;
  const [interventions, setInterventions] = useState(MOCK_INTERVENTIONS);
  const [materials, setMaterials] = useState(MOCK_MATERIALS);
  const [exerciseSets, setExerciseSets] = useState<Record<string, ExerciseSet | "generating">>({});
  const classContext = MOCK_CLASS_CONTEXT;

  const value = useMemo<TeacherStore>(() => {
    const rows = students.map((s) => {
      const mine = sessions.filter((x) => x.student_id === s.id);
      return {
        ...s,
        conversations: mine.length,
        last_activity: mine.at(-1)?.started_at ?? null,
        gaps: gaps.filter((g) => g.student_id === s.id && g.status === "open"),
      };
    });
    return {
      students,
      sessions,
      gaps,
      insights,
      interventions,
      materials,
      classContext,
      rows,
      exerciseSets,
      generateExercises(interventionId) {
        setExerciseSets((all) => ({ ...all, [interventionId]: "generating" }));
        // The API will ask the LLM for questions on the intervention's gaps; the mock returns a fixed list.
        setTimeout(() => {
          const set = mockExerciseSet(interventionId);
          setExerciseSets((all) => {
            const next = { ...all };
            if (set) next[interventionId] = set;
            else delete next[interventionId];
            return next;
          });
        }, 1500);
      },
      setInterventionStatus(id, status) {
        setInterventions((list) => list.map((i) => (i.id === id ? { ...i, status } : i)));
      },
      async uploadMaterial({ title, file }) {
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
  }, [students, sessions, gaps, insights, interventions, materials, classContext, exerciseSets]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTeacher() {
  const store = useContext(Ctx);
  if (!store) throw new Error("useTeacher outside TeacherStoreProvider");
  return store;
}
