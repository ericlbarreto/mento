import { z } from "zod";
import type { Citation } from "./citation";

/** One passage (~300–500 tokens inside a single page) of a teacher material. */
export const Chunk = z.object({
  id: z.string().min(1),
  material_id: z.string().min(1),
  subject: z.string().min(1),
  chapter: z.string().optional(),
  page: z.number().int().min(1),
  passage_idx: z.number().int().min(0),
  text: z.string().min(1),
  score: z.number().optional(),
});
export type Chunk = z.infer<typeof Chunk>;

export const SearchQuery = z.object({
  query: z.string().min(1).max(500),
  k: z.number().int().min(1).max(12),
  material_id: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

/** Implemented by @mento/sources (Person 1, Plan 5); consumed by the tutor. The LLM never sees embeddings. */
export interface Retriever {
  searchChunks(q: SearchQuery): Promise<Chunk[]>;
  /** True when `c.quote` occurs in that material page. */
  validateCitation(c: Citation): Promise<boolean>;
}
