"use client";

// Owner: Person 2. Loads the start screen lists (students + ready materials) with one silent retry.
import { useCallback, useEffect, useState } from "react";
import type { MaterialSummary, StudentSummary } from "@mento/board";
import { listMaterials, listStudents } from "@/lib/api";

export type StartData =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; students: StudentSummary[]; materials: MaterialSummary[] };

const RETRY_DELAY_MS = 800;

async function loadOnce() {
  const [students, materials] = await Promise.all([listStudents(), listMaterials({ ready_only: true })]);
  return { students, materials };
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
