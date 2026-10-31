import { describe, expect, it } from "vitest";
import { textPipeline, vectorPipeline } from "./mongo-chunk-store";

describe("vectorPipeline", () => {
  it("uses the vector index with candidates >= 100 and no filter by default", () => {
    const [search, project] = vectorPipeline([0.1, 0.2], 10, {}) as [{ $vectorSearch: Record<string, unknown> }, Record<string, unknown>];
    expect(search.$vectorSearch).toEqual({ index: "chunks_vector", path: "embedding", queryVector: [0.1, 0.2], numCandidates: 100, limit: 10 });
    expect(project).toEqual({ $project: { embedding: 0, score: { $meta: "vectorSearchScore" } } });
  });

  it("raises numCandidates with the limit and builds equality pre-filters", () => {
    const one = vectorPipeline([1], 20, { subject: "history" })[0] as { $vectorSearch: Record<string, unknown> };
    expect(one.$vectorSearch.numCandidates).toBe(200);
    expect(one.$vectorSearch.filter).toEqual({ subject: { $eq: "history" } });
    const both = vectorPipeline([1], 5, { material_id: "m1", subject: "history" })[0] as { $vectorSearch: Record<string, unknown> };
    expect(both.$vectorSearch.filter).toEqual({ $and: [{ material_id: { $eq: "m1" } }, { subject: { $eq: "history" } }] });
  });
});

describe("textPipeline", () => {
  it("searches the text index, matches material and subject afterwards, and limits", () => {
    expect(textPipeline("fim da república", 10, {})).toEqual([
      { $search: { index: "chunks_text", text: { query: "fim da república", path: "text" } } },
      { $limit: 10 },
      { $project: { embedding: 0, score: { $meta: "searchScore" } } },
    ]);
    expect(textPipeline("x", 5, { subject: "history" })[1]).toEqual({ $match: { subject: "history" } });
  });
});
