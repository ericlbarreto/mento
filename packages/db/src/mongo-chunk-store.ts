import mongoose from "mongoose";
import type { CatalogRecord, Chunk, ChunkFilter, ChunkStore, MaterialRecord, PassageRecord } from "@mento/contracts";
import { ChunkModel } from "./models/chunk.model";
import { MaterialModel } from "./models/material.model";
import { TEXT_INDEX, VECTOR_INDEX, ensureSearchIndexes } from "./search-indexes";

interface ChunkDoc {
  _id: unknown;
  material_id: string;
  subject: string;
  chapter?: string | null;
  page: number;
  passage_idx: number;
  text: string;
  score?: number;
}

const toChunk = (d: ChunkDoc): Chunk => ({
  id: String(d._id),
  material_id: d.material_id,
  subject: d.subject,
  chapter: d.chapter ?? undefined,
  page: d.page,
  passage_idx: d.passage_idx,
  text: d.text,
  score: d.score,
});

const equalities = (f: ChunkFilter): Record<string, { $eq: string }>[] => {
  const out: Record<string, { $eq: string }>[] = [];
  if (f.material_id) out.push({ material_id: { $eq: f.material_id } });
  if (f.subject) out.push({ subject: { $eq: f.subject } });
  return out;
};

/** `$vectorSearch` over the embeddings, optionally pre-filtered by material and subject. */
export function vectorPipeline(vector: number[], limit: number, filter: ChunkFilter): Record<string, unknown>[] {
  const conditions = equalities(filter);
  return [
    {
      $vectorSearch: {
        index: VECTOR_INDEX,
        path: "embedding",
        queryVector: vector,
        numCandidates: Math.max(100, limit * 10),
        limit,
        ...(conditions.length === 1 ? { filter: conditions[0] } : conditions.length > 1 ? { filter: { $and: conditions } } : {}),
      },
    },
    { $project: { embedding: 0, score: { $meta: "vectorSearchScore" } } },
  ];
}

/** Atlas Search full-text query on the passage text; material/subject are applied right after. */
export function textPipeline(query: string, limit: number, filter: ChunkFilter): Record<string, unknown>[] {
  const match: Record<string, string> = {};
  if (filter.material_id) match.material_id = filter.material_id;
  if (filter.subject) match.subject = filter.subject;
  return [
    { $search: { index: TEXT_INDEX, text: { query, path: "text" } } },
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $limit: limit },
    { $project: { embedding: 0, score: { $meta: "searchScore" } } },
  ];
}

export class MongoChunkStore implements ChunkStore {
  async vectorSearch(vector: number[], limit: number, filter: ChunkFilter): Promise<Chunk[]> {
    const docs = await ChunkModel.aggregate<ChunkDoc>(vectorPipeline(vector, limit, filter) as never);
    return docs.map(toChunk);
  }

  async textSearch(query: string, limit: number, filter: ChunkFilter): Promise<Chunk[]> {
    const docs = await ChunkModel.aggregate<ChunkDoc>(textPipeline(query, limit, filter) as never);
    return docs.map(toChunk);
  }

  async getPagePassages(material_id: string, page: number): Promise<Chunk[]> {
    const docs = await ChunkModel.find({ material_id, page }).sort({ passage_idx: 1 }).lean<ChunkDoc[]>();
    return docs.map(toChunk);
  }

  async insertPassages(passages: PassageRecord[]): Promise<void> {
    // Embeddings are ~8 KB each: insert in batches to stay far below the 16 MB document-batch limit.
    for (let i = 0; i < passages.length; i += 500) {
      await ChunkModel.insertMany(passages.slice(i, i + 500), { ordered: false });
    }
  }

  async createMaterial(material: MaterialRecord): Promise<{ id: string }> {
    const doc = await MaterialModel.create(material);
    return { id: String(doc._id) };
  }

  async updateMaterial(id: string, patch: Partial<MaterialRecord>): Promise<void> {
    await MaterialModel.findByIdAndUpdate(id, patch);
  }

  async listCatalog(): Promise<CatalogRecord[]> {
    const docs = await MaterialModel.find({ status: "ready" })
      .sort({ createdAt: 1 })
      .lean<{ _id: unknown; title: string; subject: string; chapters?: { title: string }[] }[]>();
    return docs.map((d) => ({ material_id: String(d._id), title: d.title, subject: d.subject, chapters: (d.chapters ?? []).map((c) => c.title) }));
  }
}

/** Create the vector and text indexes on the `chunks` collection (idempotent). Needs MongoDB Atlas (or `mongot`). */
export async function ensureChunkIndexes(): Promise<string[]> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB is not connected");
  return ensureSearchIndexes(db.collection(ChunkModel.collection.name));
}

/** Remove every material with this title and all of its passages (used by `pnpm ingest --replace`). */
export async function deleteMaterialsByTitle(title: string): Promise<{ materials: number; chunks: number }> {
  const ids = (await MaterialModel.find({ title }).select("_id").lean<{ _id: unknown }[]>()).map((d) => String(d._id));
  if (ids.length === 0) return { materials: 0, chunks: 0 };
  const chunks = await ChunkModel.deleteMany({ material_id: { $in: ids } });
  const materials = await MaterialModel.deleteMany({ _id: { $in: ids } });
  return { materials: materials.deletedCount, chunks: chunks.deletedCount };
}

