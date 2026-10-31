// Owner: Person 2. The stats row of the paused / ended modal (Stitch S6, plan 2026-10-30-2330 §3 S6): computed
// locally, and each one is null (hidden) when unknown.
import type { BoardState, TranscriptLine } from "@mento/board";

export interface SessionStats {
  /** "Tempo": elapsed since `started_at`. */
  elapsed: string | null;
  /** "Lousa": number of board elements. */
  items: string | null;
  /** "Referência": the last cited page. */
  reference: string | null;
}

/** "{m} min" (or "{h} h {mm} min"); "< 1 min" under a minute; null for a missing or invalid start. */
export function formatElapsed(startedAt: string | null | undefined, now: number): string | null {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;
  const minutes = Math.floor(Math.max(0, now - start) / 60_000);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

export function formatItems(count: number): string {
  return count === 1 ? "1 item" : `${count} itens`;
}

/**
 * Page of the last citation: the latest cited line of the conversation (speak sources, in order), else the
 * latest cited board element (by creation order). The last source of that line or element wins.
 */
export function lastCitedPage(board: BoardState | null, lines: readonly Pick<TranscriptLine, "sources">[] = []): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const page = lines[i]?.sources?.at(-1)?.page;
    if (page !== undefined) return page;
  }
  if (!board) return null;
  let latest: { at: number; page: number } | null = null;
  for (const el of board.elements.values()) {
    const page = el.sources?.at(-1)?.page;
    if (page !== undefined && (!latest || el.created_at >= latest.at)) latest = { at: el.created_at, page };
  }
  return latest?.page ?? null;
}

export function sessionStats(
  startedAt: string | null | undefined,
  board: BoardState | null,
  now: number,
  lines: readonly Pick<TranscriptLine, "sources">[] = [],
): SessionStats {
  const page = lastCitedPage(board, lines);
  return {
    elapsed: formatElapsed(startedAt, now),
    items: board ? formatItems(board.elements.size) : null,
    reference: page === null ? null : `pág. ${page}`,
  };
}
