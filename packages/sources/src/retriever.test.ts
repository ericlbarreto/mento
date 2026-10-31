import { describe, expect, it } from "vitest";
import type { Chunk, ChunkFilter, ChunkStore } from "@mento/contracts";
import { createRetriever } from "./retriever";

const c = (id: string, page = 1, text = id): Chunk => ({ id, material_id: "m1", subject: "history", page, passage_idx: 0, text });

function fakeStore(over: Partial<ChunkStore> = {}) {
  const seen: { vector?: { v: number[]; limit: number; filter: ChunkFilter }; text?: { q: string; limit: number; filter: ChunkFilter } } = {};
  const store: ChunkStore = {
    vectorSearch: async (v, limit, filter) => ((seen.vector = { v, limit, filter }), [c("a"), c("b")]),
    textSearch: async (q, limit, filter) => ((seen.text = { q, limit, filter }), [c("b"), c("d")]),
    getPagePassages: async () => [],
    insertPassages: async () => undefined,
    createMaterial: async () => ({ id: "m" }),
    updateMaterial: async () => undefined,
    listCatalog: async () => [],
    ...over,
  };
  return { store, seen };
}
const embed = async (texts: string[], type: "document" | "query") => texts.map(() => [type === "query" ? 1 : 0, 0.5]);

describe("createRetriever.searchChunks", () => {
  it("embeds the question as a query, runs both searches with the filter and fuses the rankings", async () => {
    const { store, seen } = fakeStore();
    const out = await createRetriever({ store, embed }).searchChunks({ query: "fim da república", k: 2, subject: "history" });
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
    expect(seen.vector).toEqual({ v: [1, 0.5], limit: 10, filter: { material_id: undefined, subject: "history" } });
    expect(seen.text?.q).toBe("fim da república");
  });

  it("still answers when one side fails, and returns nothing (without throwing) when both fail", async () => {
    const logs: string[] = [];
    const log = (m: string) => void logs.push(m);
    const noVector = fakeStore({ vectorSearch: async () => { throw new Error("no index"); } }).store;
    expect((await createRetriever({ store: noVector, embed, log }).searchChunks({ query: "x", k: 5 })).map((x) => x.id)).toEqual(["b", "d"]);

    const badEmbed = async () => { throw new Error("voyage down"); };
    expect((await createRetriever({ store: fakeStore().store, embed: badEmbed, log }).searchChunks({ query: "x", k: 5 })).map((x) => x.id)).toEqual(["b", "d"]);

    const none = fakeStore({ vectorSearch: async () => { throw new Error("a"); }, textSearch: async () => { throw new Error("b"); } }).store;
    expect(await createRetriever({ store: none, embed, log }).searchChunks({ query: "x", k: 5 })).toEqual([]);
    expect(logs.filter((l) => l.includes("failed"))).toHaveLength(4);
  });
});

describe("createRetriever when the database is not available", () => {
  it("answers nothing at once, without touching the store or the embedder", async () => {
    let touched = 0;
    const { store } = fakeStore({ vectorSearch: async () => (touched++, []), textSearch: async () => (touched++, []), getPagePassages: async () => (touched++, []) });
    const r = createRetriever({ store, embed: async () => (touched++, [[1]]), isAvailable: () => false });
    expect(await r.searchChunks({ query: "x", k: 3 })).toEqual([]);
    expect(await r.validateCitation({ material_id: "m1", page: 1, quote: "x" })).toBe(false);
    expect(touched).toBe(0);
  });
});

describe("createRetriever.validateCitation", () => {
  const store = fakeStore({ getPagePassages: async (m, page) => (m === "m1" && page === 12 ? [c("p1", 12, "Em 27 a.C., o Senado concedeu a Otávio"), c("p2", 12, "o título de Augusto.")] : []) }).store;
  const retriever = createRetriever({ store, embed });

  it("accepts a quote that occurs on the page (even across passages and with different spacing or case)", async () => {
    expect(await retriever.validateCitation({ material_id: "m1", page: 12, quote: "o  Senado concedeu a OTÁVIO" })).toBe(true);
    expect(await retriever.validateCitation({ material_id: "m1", page: 12, quote: "a Otávio o título de Augusto" })).toBe(true);
  });

  it("rejects a quote that is not on the page or a page that does not exist", async () => {
    expect(await retriever.validateCitation({ material_id: "m1", page: 12, quote: "frase inventada" })).toBe(false);
    expect(await retriever.validateCitation({ material_id: "m1", page: 99, quote: "Senado" })).toBe(false);
  });
});
