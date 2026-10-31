import type { Chunk } from "@mento/contracts";

/** Reciprocal rank fusion: merge ranked lists (vector, text) into one, scoring each chunk by 1 / (k + rank). */
export function reciprocalRankFusion(lists: Chunk[][], k = 60): Chunk[] {
  const scores = new Map<string, number>();
  const chunks = new Map<string, Chunk>();
  for (const list of lists) {
    list.forEach((chunk, rank) => {
      if (!chunks.has(chunk.id)) chunks.set(chunk.id, chunk);
      scores.set(chunk.id, (scores.get(chunk.id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...chunks.values()].map((c) => ({ ...c, score: scores.get(c.id) })).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
