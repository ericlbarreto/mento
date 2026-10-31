import { describe, expect, it } from "vitest";
import { TEXT_INDEX, VECTOR_INDEX, ensureSearchIndexes, textIndexDefinition, vectorIndexDefinition, type SearchIndexCollection } from "./search-indexes";

function fakeCollection(existing: string[]) {
  const created: { name: string; type?: string; definition: unknown }[] = [];
  const collection: SearchIndexCollection = {
    listSearchIndexes: () => ({ toArray: async () => existing.map((name) => ({ name })) }),
    createSearchIndex: async (d) => (created.push(d), d.name),
  };
  return { collection, created };
}

describe("ensureSearchIndexes", () => {
  it("creates both indexes when none exist, with the right types", async () => {
    const { collection, created } = fakeCollection([]);
    expect(await ensureSearchIndexes(collection)).toEqual([VECTOR_INDEX, TEXT_INDEX]);
    expect(created.map((c) => [c.name, c.type])).toEqual([[VECTOR_INDEX, "vectorSearch"], [TEXT_INDEX, "search"]]);
  });

  it("creates only the missing one and nothing when both exist", async () => {
    const some = fakeCollection([VECTOR_INDEX]);
    expect(await ensureSearchIndexes(some.collection)).toEqual([TEXT_INDEX]);
    const all = fakeCollection([VECTOR_INDEX, TEXT_INDEX]);
    expect(await ensureSearchIndexes(all.collection)).toEqual([]);
    expect(all.created).toEqual([]);
  });
});

describe("index definitions", () => {
  it("uses 1024-dimension cosine vectors with material and subject filters", () => {
    expect(vectorIndexDefinition().fields).toEqual([
      { type: "vector", path: "embedding", numDimensions: 1024, similarity: "cosine" },
      { type: "filter", path: "material_id" },
      { type: "filter", path: "subject" },
    ]);
  });

  it("uses the Portuguese analyzer on the passage text", () => {
    expect(textIndexDefinition().mappings.fields.text.analyzer).toBe("lucene.portuguese");
  });
});
