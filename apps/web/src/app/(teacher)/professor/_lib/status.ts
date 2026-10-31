// Owner: Person 1. One label per student, derived from their open insights (no score, no ranking).
import type { StudentRow } from "./store";
import type { Insight } from "./types";

export type StudentStatus = { label: string; tone: "danger" | "warn" | "ok" | "neutral" };

export function studentStatus(row: StudentRow, insights: Insight[]): StudentStatus {
  if (row.conversations === 0) return { label: "Sem conversas", tone: "neutral" };
  const open = insights.filter((i) => i.student_id === row.id && i.kind === "gap" && (i.status === "new" || i.status === "accepted"));
  if (open.some((i) => i.severity === "critical")) return { label: "Lacuna ativa", tone: "danger" };
  if (open.length > 0) return { label: "Em atenção", tone: "warn" };
  return { label: "Em dia", tone: "ok" };
}

/** The insight to show next to a student: the most severe open gap, else the latest progress. */
export function highlight(studentId: string, insights: Insight[]) {
  const mine = insights.filter((i) => i.student_id === studentId && i.status !== "dismissed");
  const gaps = mine.filter((i) => i.kind === "gap").sort((a, b) => (a.severity === "critical" ? -1 : 0) - (b.severity === "critical" ? -1 : 0));
  return gaps[0] ?? mine.filter((i) => i.kind === "progress").at(-1) ?? null;
}

export const firstName = (name: string) => name.split(" ")[0] ?? name;
