// Owner: Person 2. Pure helpers for the "Histórico de Aulas" drawer (Stitch S7, plan §3): status, filters,
// counts, search and the pt-BR date/duration labels. Kept apart from the component so they are unit-tested.
import type { SessionSummary } from "@mento/contracts";

export type HistoryFilter = "all" | "active" | "ended";

export const FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "active", label: "Em andamento" },
  { id: "ended", label: "Concluídas" },
];

export const UNTITLED = "Conversa sem título";

export function historyTitle(s: SessionSummary): string {
  return s.title?.trim() || UNTITLED;
}

/** "Em andamento" until the session has `ended_at`. */
export function isEnded(s: SessionSummary): boolean {
  return s.ended_at != null;
}

export function countByFilter(list: SessionSummary[]): Record<HistoryFilter, number> {
  const ended = list.filter(isEnded).length;
  return { all: list.length, active: list.length - ended, ended };
}

/** Lowercase without accents, so "historia" finds "História". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/**
 * The cards to show: the filter, then the search over the title and the date label ("tópicos ou datas"),
 * with the current session first and the rest in the API order (newest activity first).
 */
export function visibleSessions(
  list: SessionSummary[],
  { filter, query, currentId, now = new Date() }: { filter: HistoryFilter; query: string; currentId?: string; now?: Date },
): SessionSummary[] {
  const q = normalize(query);
  const shown = list.filter((s) => {
    if (filter === "active" && isEnded(s)) return false;
    if (filter === "ended" && !isEnded(s)) return false;
    return !q || normalize(`${historyTitle(s)} ${historyDate(s.started_at, now)}`).includes(q);
  });
  const current = shown.findIndex((s) => s.id === currentId);
  if (current > 0) shown.unshift(...shown.splice(current, 1));
  return shown;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Hoje, 09:41", "Ontem, 18:05", then "14 de outubro" ("14 de outubro de 2025" in another year). Local time. */
export function historyDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay(d, now)) return `Hoje, ${time}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, yesterday)) return `Ontem, ${time}`;
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("pt-BR", opts);
}

/** "{m} min" from `started_at` to `last_activity_at` (whole minutes; under a minute reads "< 1 min"). */
export function historyDuration(s: SessionSummary): string {
  const ms = new Date(s.last_activity_at).getTime() - new Date(s.started_at).getTime();
  const min = Number.isFinite(ms) ? Math.floor(ms / 60_000) : 0;
  return min < 1 ? "< 1 min" : `${min} min`;
}

/** "1 interação" / "{n} interações" (tutor turns completed). */
export function interactions(n: number): string {
  return n === 1 ? "1 interação" : `${n} interações`;
}

export function drawerTitle(subjectName?: string | null): string {
  return subjectName ? `Histórico de Aulas de ${subjectName}` : "Histórico de Aulas";
}

export function newConversationLabel(subjectName?: string | null): string {
  return subjectName ? `Iniciar nova conversa de ${subjectName}` : "Iniciar nova conversa";
}
