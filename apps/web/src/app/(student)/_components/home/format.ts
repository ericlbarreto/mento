// Owner: Person 2. Pure text helpers for the student home (S1). Kept apart from the components so they are unit-tested.
import type { SessionSummary } from "@mento/contracts";

/** Which icon a subject card shows, chosen by the subject `key` (plan §3 S1). Unknown keys get the book. */
export type SubjectIconName = "landmark" | "ruler" | "book";

export function subjectIcon(key: string): SubjectIconName {
  if (key === "history") return "landmark";
  if (key === "math") return "ruler";
  return "book";
}

/** "1 livro" / "3 livros". */
export function bookCount(n: number): string {
  return n === 1 ? "1 livro" : `${n} livros`;
}

/** "Ana S." → "Ana". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export const UNTITLED_SESSION = "Conversa sem título";
export const FREE_BOARD = "Lousa livre";

export function sessionTitle(s: SessionSummary): string {
  return s.title?.trim() || UNTITLED_SESSION;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Past time in pt-BR: "agora há pouco", "há 5 min", "há 2 h", "ontem", "há 3 dias", then the date ("12/10"). */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();
  if (!Number.isFinite(diff) || diff < MINUTE) return "agora há pouco";
  if (diff < HOUR) return `há ${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) return `há ${Math.floor(diff / HOUR)} h`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  return then.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** "{matéria ou Lousa livre} · {n} interações · {tempo relativo}" under "Continuar de onde parou". */
export function sessionSubtitle(s: SessionSummary, now: Date = new Date()): string {
  const interactions = s.turn_count === 1 ? "1 interação" : `${s.turn_count} interações`;
  return [s.subject?.name ?? FREE_BOARD, interactions, relativeTime(s.last_activity_at, now)].join(" · ");
}

/** Whole minutes from start to end (or last activity), at least 1. */
export function sessionMinutes(s: SessionSummary): number {
  const end = new Date(s.ended_at ?? s.last_activity_at).getTime();
  const ms = end - new Date(s.started_at).getTime();
  return Math.max(1, Math.round((Number.isFinite(ms) ? ms : 0) / MINUTE));
}

/** Hero pill: "{título} · {n} min". */
export function lastSessionLabel(s: SessionSummary): string {
  return `${sessionTitle(s)} · ${sessionMinutes(s)} min`;
}
