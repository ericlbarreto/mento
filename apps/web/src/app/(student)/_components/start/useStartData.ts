"use client";

// Owner: Person 2. Loads the start screen lists (students + subjects) with one silent retry.
// No students route yet (404): the mock students are used and flagged as simulated (AGENTS.md rule 4).
import { useCallback, useEffect, useState } from "react";
import type { SubjectSummary } from "@mento/contracts";
import { MOCK_STUDENTS, type StudentSummary } from "@mento/board";
import { listStudents, listSubjects } from "@/lib/api";

export type StartData =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; students: StudentSummary[]; simulatedStudents: boolean; subjects: SubjectSummary[] };

const RETRY_DELAY_MS = 800;

async function loadOnce() {
  const [students, subjects] = await Promise.all([listStudents(), listSubjects()]);
  return { students: students ?? MOCK_STUDENTS, simulatedStudents: students === null, subjects };
}

export function useStartData(): { data: StartData; retry: () => void } {
  const [data, setData] = useState<StartData>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let result;
        try {
          result = await loadOnce();
        } catch {
          // The API may still be waking up: wait a moment and try once more before showing the error.
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          if (cancelled) return;
          result = await loadOnce();
        }
        if (!cancelled) setData({ status: "ready", ...result });
      } catch {
        if (!cancelled) setData({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setData({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { data, retry };
}
