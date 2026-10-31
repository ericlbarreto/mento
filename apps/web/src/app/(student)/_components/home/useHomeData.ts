"use client";

// Owner: Person 2. Data for the student home (S1): the current student, the subjects and the latest session.
// Student identity (plan §2): the id lives in sessionStorage (default: the demo student) and is sent as student_id.
// No students route yet (404): the mock students are used and flagged as simulated (AGENTS.md rule 4).
import { useCallback, useEffect, useState } from "react";
import type { SessionSummary, SubjectSummary } from "@mento/contracts";
import { DEMO_STUDENT_ID, MOCK_STUDENTS, type StudentSummary } from "@mento/board";
import { MOCK_API, listSessions, listStudents, listSubjects } from "@/lib/api";

/** sessionStorage key with the current student's id (read by the session page too). */
export const STUDENT_ID_KEY = "mento.student_id";

export function readStudentId(): string {
  try {
    return sessionStorage.getItem(STUDENT_ID_KEY) || DEMO_STUDENT_ID;
  } catch {
    return DEMO_STUDENT_ID;
  }
}

function storeStudentId(id: string) {
  try {
    sessionStorage.setItem(STUDENT_ID_KEY, id);
  } catch {
    // Storage blocked (private mode): the choice lasts until reload.
  }
}

type Load<T> = { status: "loading" } | { status: "error" } | { status: "ready"; value: T };

export interface HomeData {
  /** null until sessionStorage was read (after mount). */
  studentId: string | null;
  students: Load<{ list: StudentSummary[]; simulated: boolean }>;
  subjects: Load<SubjectSummary[]>;
  /** Most recent session of the current student, or null when there is none. */
  latest: Load<SessionSummary | null>;
}

const RETRY_DELAY_MS = 800;

/** Runs `fn`, and once more after a short pause if it fails (the API may still be waking up). */
async function withRetry<T>(fn: () => Promise<T>, cancelled: () => boolean): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    if (cancelled()) throw err;
    return fn();
  }
}

export function useHomeData(): HomeData & { retry: () => void; pickStudent: (s: StudentSummary) => void } {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [students, setStudents] = useState<HomeData["students"]>({ status: "loading" });
  const [subjects, setSubjects] = useState<HomeData["subjects"]>({ status: "loading" });
  const [latest, setLatest] = useState<HomeData["latest"]>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => setStudentId(readStudentId()), []);

  // Students and subjects do not depend on who is studying.
  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    withRetry(listStudents, isCancelled)
      .then((list) => !cancelled && setStudents({ status: "ready", value: { list: list ?? MOCK_STUDENTS, simulated: MOCK_API || list === null } }))
      .catch(() => !cancelled && setStudents({ status: "error" }));
    withRetry(listSubjects, isCancelled)
      .then((value) => !cancelled && setSubjects({ status: "ready", value }))
      .catch(() => !cancelled && setSubjects({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // A stored id that is not in the list (stale tab, removed student): fall back to the demo or first student.
  useEffect(() => {
    if (students.status !== "ready" || !studentId) return;
    const { list } = students.value;
    const fallback = list.find((s) => s.id === DEMO_STUDENT_ID) ?? list[0];
    if (fallback && !list.some((s) => s.id === studentId)) setStudentId(fallback.id);
  }, [students, studentId]);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setLatest({ status: "loading" });
    withRetry(() => listSessions({ student_id: studentId, limit: 100 }), () => cancelled)
      .then((list) => !cancelled && setLatest({ status: "ready", value: list[0] ?? null }))
      .catch(() => !cancelled && setLatest({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [studentId, attempt]);

  const retry = useCallback(() => {
    setStudents((s) => (s.status === "error" ? { status: "loading" } : s));
    setSubjects((s) => (s.status === "error" ? { status: "loading" } : s));
    setAttempt((n) => n + 1);
  }, []);

  const pickStudent = useCallback((s: StudentSummary) => {
    storeStudentId(s.id);
    setStudentId(s.id);
  }, []);

  return { studentId, students, subjects, latest, retry, pickStudent };
}
