import type { Chunk } from "./retrieval";

/** A passage ready to be stored: a `Chunk` without id/score plus its embedding. */
export interface PassageRecord {
  material_id: string;
  subject: string;
  chapter?: string;
  page: number;
  passage_idx: number;
  text: string;
  embedding: number[];
}

export interface ChunkFilter {
  material_id?: string;
  subject?: string;
}

export interface MaterialRecord {
  title: string;
  subject: string;
  chapters: { title: string; start_page: number; end_page: number }[];
  pages: number;
  status: "processing" | "ready" | "failed";
}

/** What the tutor's prompt needs to know about each material (same shape as the tutor's `CatalogEntry`). */
export interface CatalogRecord {
  material_id: string;
  title: string;
  subject: string;
  chapters: string[];
}

/** Storage behind the retriever and the ingestion. Implemented by `MongoChunkStore` in @mento/db. */
export interface ChunkStore {
  vectorSearch(vector: number[], limit: number, filter: ChunkFilter): Promise<Chunk[]>;
  textSearch(query: string, limit: number, filter: ChunkFilter): Promise<Chunk[]>;
  getPagePassages(material_id: string, page: number): Promise<Chunk[]>;
  insertPassages(passages: PassageRecord[]): Promise<void>;
  createMaterial(material: MaterialRecord): Promise<{ id: string }>;
  updateMaterial(id: string, patch: Partial<MaterialRecord>): Promise<void>;
  listCatalog(): Promise<CatalogRecord[]>;
}
