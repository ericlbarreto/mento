// Owner: Person 1. Shared labels for gaps and students (no score, no ranking).
import type { StudentRow } from "./store";
import type { Gap } from "./types";

export const confidenceLabel = (c: number) => (c >= 0.75 ? "alta" : c >= 0.5 ? "média" : "baixa");

export const evidenceLine = (g: Gap) =>
  `${g.attempts} ${g.attempts === 1 ? "resposta" : "respostas"} · confiança ${confidenceLabel(g.confidence)}`;

export const ORIGIN_LABEL: Record<Gap["origin"], string> = {
  stated: "Disse no chat",
  inferred: "Percebido nas respostas",
};

export type StudentStatus = { label: string; tone: "danger" | "warn" | "ok" | "neutral" };

export function studentStatus(row: StudentRow): StudentStatus {
  if (row.conversations === 0) return { label: "Sem conversas", tone: "neutral" };
  if (row.gaps.length === 0) return { label: "Sem lacunas abertas", tone: "ok" };
  const n = row.gaps.length;
  return { label: n === 1 ? "1 lacuna" : `${n} lacunas`, tone: row.gaps.some((g) => g.severity === "critical") ? "danger" : "warn" };
}

export const firstName = (name: string) => name.split(" ")[0] ?? name;
