"use client";
// Owner: Person 1. In-memory teacher workspace (mock). Each action maps to one teacher API route of PR #7,
// noted next to it, so wiring the real API later only replaces the bodies here.
import { createContext, useContext, useMemo, useState } from "react";
import { MOCK_CLASS_CONTEXT, MOCK_INSIGHTS, MOCK_MATERIALS, MOCK_SESSIONS, MOCK_STUDENTS } from "./mock";
import type { ClassContext, Insight, InsightStatus, Material, SessionItem, Student } from "./types";

const OPEN: InsightStatus[] = ["new", "accepted"];

export interface StudentRow extends Student {
  conversations: number;
  last_activity: string | null;
  open_gaps: number;
}

interface TeacherStore {
  students: Student[];
  sessions: SessionItem[];
  insights: Insight[];
  materials: Material[];
  classContext: ClassContext;
  rows: StudentRow[];
  overview: { students: number; conversations: number; gaps: number; insights: number };
  setInsightStatus(id: string, status: InsightStatus): void; // PATCH /insights/:id
  saveClassContext(next: ClassContext): void; // PUT /class-context
  uploadMaterial(input: { title: string; subject: string; file: File }): Promise<Material>; // POST /materials
}

const Ctx = createContext<TeacherStore | null>(null);

export function isOpenGap(i: Insight) {
  return i.kind === "gap" && OPEN.includes(i.status);
}

/** Counts pages from the PDF bytes (`/Type /Page` objects). Good enough for the mock; the API extracts it. */
async function countPages(file: File) {
  const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
  return (text.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

export function TeacherStoreProvider({ children }: { children: React.ReactNode }) {
  const students = MOCK_STUDENTS;
  const [insights, setInsights] = useState(MOCK_INSIGHTS);
  const [materials, setMaterials] = useState(MOCK_MATERIALS);
  const [classContext, setClassContext] = useState(MOCK_CLASS_CONTEXT);
  const sessions = MOCK_SESSIONS;

  const value = useMemo<TeacherStore>(() => {
    const rows = students.map((s) => {
      const mine = sessions.filter((x) => x.student_id === s.id);
      return {
        ...s,
        conversations: mine.length,
        last_activity: mine.at(-1)?.started_at ?? null,
        open_gaps: insights.filter((i) => i.student_id === s.id && isOpenGap(i)).length,
      };
    });
    return {
      students,
      sessions,
      insights,
      materials,
      classContext,
      rows,
      overview: {
        students: students.length,
        conversations: sessions.length,
        gaps: insights.filter((i) => i.kind === "gap" && i.status !== "dismissed").length,
        insights: insights.length,
      },
      setInsightStatus(id, status) {
        setInsights((list) => list.map((i) => (i.id === id ? { ...i, status } : i)));
      },
      saveClassContext: setClassContext,
      async uploadMaterial({ title, subject, file }) {
        const material: Material = {
          id: `mat_${Date.now()}`,
          title,
          subject,
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
  }, [students, sessions, insights, materials, classContext]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTeacher() {
  const store = useContext(Ctx);
  if (!store) throw new Error("useTeacher outside TeacherStoreProvider");
  return store;
}
