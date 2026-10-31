// Owner: Person 1. Shared labels for gaps and students (no score, no ranking).
import type { StudentRow } from "./store";
import type { Gap } from "./types";

export const confidenceLabel = (c: number) => (c >= 0.75 ? "alta" : c >= 0.5 ? "média" : "baixa");

export const evidenceLine = (g: Gap) =>
  `${g.attempts} ${g.attempts === 1 ? "resposta" : "respostas"} · confiança ${confidenceLabel(g.confidence)}`;

export const ORIGIN_LABEL: Record<NonNullable<Gap["origin"]>, string> = {
  stated: "Disse no chat",
  inferred: "Percebido nas respostas",
};

export type StudentStatus = { label: string; tone: "danger" | "warn" | "ok" | "neutral" };

export function studentStatus(row: StudentRow): StudentStatus {
  // Gaps first: a student can have findings before their conversations are listed (simulated seed data).
  if (row.gaps.length === 0) return row.conversations === 0 ? { label: "Sem conversas", tone: "neutral" } : { label: "Sem lacunas abertas", tone: "ok" };
  const n = row.gaps.length;
  return { label: n === 1 ? "1 lacuna" : `${n} lacunas`, tone: row.gaps.some((g) => g.severity === "critical") ? "danger" : "warn" };
}

export const firstName = (name: string) => name.split(" ")[0] ?? name;

export const STATE_LABEL: Record<import("./types").ConceptState, string> = {
  consolidated: "Consolidado",
  in_transition: "Em transição",
  sampling: "Em sondagem",
  gap: "Lacuna ativa",
};

export type Tone = "danger" | "warn" | "ok" | "blue" | "neutral";

/**
 * How firm a gap is, from the pattern across conversations (the teacher does not have to confirm it):
 * a first sign is only watched; it becomes a gap when it repeats, and persistent when it keeps coming back.
 */
export function gapStage(g: Gap): { label: string; tone: Tone; note: string } {
  const conversations = g.incorrect_sessions ?? g.sessions ?? 1;
  if (conversations >= 3) return { label: "Persistente", tone: "danger", note: `Continua aparecendo depois de ${conversations} conversas.` };
  if (g.rule === "M1_single_error" || g.rule === "M2_needs_hints" || g.attempts < 2)
    return { label: "Em observação", tone: "warn", note: "Primeiro sinal. O tutor vai acompanhar nas próximas conversas antes de concluir." };
  return {
    label: "Lacuna",
    tone: g.severity === "critical" ? "danger" : "warn",
    note: conversations >= 2 ? `Apareceu em ${conversations} conversas.` : "Apareceu mais de uma vez na mesma conversa.",
  };
}

/**
 * A conversation is named by what it was about: the concepts the tutor checked, else the lesson. Without either it was
 * a free conversation (no verification question), which is what the teacher needs to know about it.
 */
export function conversationTitle(s: import("./types").SessionItem): { title: string; detail: string | null } {
  const concepts = s.concepts ?? [];
  const book = s.lesson_title && s.lesson_title !== s.material_title ? s.lesson_title : s.material_title;
  if (concepts.length > 0) {
    const named = concepts.length <= 2 ? concepts.join(" e ") : `${concepts.slice(0, 2).join(", ")} e mais ${concepts.length - 2}`;
    return { title: named, detail: book };
  }
  if (s.lesson_title && s.lesson_title !== s.material_title) return { title: s.lesson_title, detail: s.material_title };
  return { title: "Conversa livre", detail: book ? `Sem perguntas de verificação · ${book}` : "Sem perguntas de verificação" };
}

/** What came out of one conversation, in the teacher's terms. */
export function conversationResult(s: import("./types").SessionItem): { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "blue" } {
  if (!s.ended_at) return { label: "Não encerrada", tone: "neutral" };
  if (s.analysis_status === "running" || s.analysis_status === "pending") return { label: "Analisando", tone: "warn" };
  if (s.analysis_status === "failed") return { label: "Análise falhou", tone: "danger" };
  if (s.analysis_status !== "done") return { label: "Sem análise", tone: "neutral" };
  const n = s.insight_count ?? 0;
  return n > 0 ? { label: n === 1 ? "1 achado" : `${n} achados`, tone: "blue" } : { label: "Nada a apontar", tone: "ok" };
}

/** "3 respondidas · 2 certas" or "—". */
export function questionsLine(s: import("./types").SessionItem): string {
  const q = s.questions ?? 0;
  if (q === 0) return "—";
  return `${q} ${q === 1 ? "respondida" : "respondidas"} · ${s.correct ?? 0} ${(s.correct ?? 0) === 1 ? "certa" : "certas"}`;
}

/** Minutes between start and end, when it ended. */
export function durationLabel(s: import("./types").SessionItem): string {
  if (!s.ended_at) return "—";
  const min = Math.max(1, Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60_000));
  return `${min} min`;
}
