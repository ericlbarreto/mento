// Owner: Person 1. pt-BR date helpers for the teacher UI.
const TODAY_FMT = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const DAY_FMT = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });

const dayKey = (d: Date) => d.toDateString();

/** "hoje, 14:20", "ontem, 09:40" or "27 de out." */
export function relativeDate(iso: string | null, now = new Date()) {
  if (!iso) return "Nenhuma conversa";
  const d = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return `hoje, ${TODAY_FMT.format(d)}`;
  if (dayKey(d) === dayKey(yesterday)) return `ontem, ${TODAY_FMT.format(d)}`;
  return DAY_FMT.format(d);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

export const pagesLabel = ([from, to]: [number, number]) => (from === to ? `p. ${from}` : `p. ${from}–${to}`);
