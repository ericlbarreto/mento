import type { Chunk, Citation, ChunkStore, Retriever, SearchQuery } from "@mento/contracts";
import { normalizeText } from "./normalize";
import { reciprocalRankFusion } from "./rrf";
import type { Embed } from "./voyage";

export interface RetrieverDeps {
  store: ChunkStore;
  embed: Embed;
  /** Return false while the database is not connected: searches then answer [] at once instead of waiting for it. */
  isAvailable?: () => boolean;
  log?: (message: string, extra?: unknown) => void;
}

/**
 * Hybrid search over all materials: the question is embedded, the vector and the text searches run in
 * parallel, and their rankings are fused. If one side fails the other still answers; if both fail the
 * result is empty (a missing passage must never break a turn).
 */
export function createRetriever(deps: RetrieverDeps): Retriever {
  const { store, embed, log, isAvailable = () => true } = deps;
  return {
    async searchChunks(q: SearchQuery): Promise<Chunk[]> {
      if (!isAvailable()) return [];
      if (q.material_ids?.length === 0) return []; // a subject without materials: nothing to search
      const filter = { material_id: q.material_id, material_ids: q.material_ids, subject: q.subject };
      const fetchLimit = Math.max(q.k * 2, 10);
      const [vector, text] = await Promise.allSettled([
        embed([q.query], "query").then(([v]) => store.vectorSearch(v as number[], fetchLimit, filter)),
        store.textSearch(q.query, fetchLimit, filter),
      ]);
      const lists: Chunk[][] = [];
      for (const [name, result] of [["vector", vector], ["text", text]] as const) {
        if (result.status === "fulfilled") lists.push(result.value);
        else log?.(`${name} search failed`, result.reason);
      }
      return reciprocalRankFusion(lists).slice(0, q.k);
    },

    async validateCitation(c: Citation): Promise<boolean> {
      if (!isAvailable()) return false;
      const passages = await store.getPagePassages(c.material_id, c.page);
      const page = normalizeText(passages.map((p) => p.text).join(" "));
      return page.includes(normalizeText(c.quote));
    },
  };
}
