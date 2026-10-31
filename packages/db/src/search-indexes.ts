export const VECTOR_INDEX = "chunks_vector";
export const TEXT_INDEX = "chunks_text";
export const EMBEDDING_DIMENSIONS = 1024;

/** The slice of the MongoDB driver's `Collection` used to manage Atlas Search indexes. */
export interface SearchIndexCollection {
  listSearchIndexes(): { toArray(): Promise<{ name?: string }[]> };
  createSearchIndex(description: { name: string; type?: "search" | "vectorSearch"; definition: Record<string, unknown> }): Promise<string>;
}

/** Vector index on the embedding; `material_id` and `subject` can be used as pre-filters. */
export const vectorIndexDefinition = () => ({
  fields: [
    { type: "vector", path: "embedding", numDimensions: EMBEDDING_DIMENSIONS, similarity: "cosine" },
    { type: "filter", path: "material_id" },
    { type: "filter", path: "subject" },
  ],
});

/** Full-text index on the passage text with the Portuguese analyzer (accents and stemming). */
export const textIndexDefinition = () => ({
  mappings: { dynamic: false, fields: { text: { type: "string", analyzer: "lucene.portuguese" } } },
});

/** Create the two search indexes if they do not exist yet. Returns the names it created. */
export async function ensureSearchIndexes(collection: SearchIndexCollection): Promise<string[]> {
  const existing = new Set((await collection.listSearchIndexes().toArray()).map((i) => i.name));
  const created: string[] = [];
  if (!existing.has(VECTOR_INDEX)) {
    await collection.createSearchIndex({ name: VECTOR_INDEX, type: "vectorSearch", definition: vectorIndexDefinition() });
    created.push(VECTOR_INDEX);
  }
  if (!existing.has(TEXT_INDEX)) {
    await collection.createSearchIndex({ name: TEXT_INDEX, type: "search", definition: textIndexDefinition() });
    created.push(TEXT_INDEX);
  }
  return created;
}
