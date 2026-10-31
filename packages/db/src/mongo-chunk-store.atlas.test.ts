import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoChunkStore, ensureChunkIndexes } from "./mongo-chunk-store";
import { connectMongo, disconnectMongo } from "./connection";

// Runs only against a real Atlas cluster: ATLAS_TEST_URI=mongodb+srv://... pnpm --filter @mento/db test
const uri = process.env.ATLAS_TEST_URI;

describe.skipIf(!uri)("MongoChunkStore on Atlas", () => {
  const store = new MongoChunkStore();
  const subject = `test-${Date.now()}`;
  let material_id = "";

  beforeAll(async () => {
    await connectMongo(uri as string);
    await ensureChunkIndexes();
    ({ id: material_id } = await store.createMaterial({ title: "Teste", subject, chapters: [], pages: 1, status: "ready" }));
    const vec = (a: number, b: number) => Array.from({ length: 1024 }, (_, i) => (i === 0 ? a : i === 1 ? b : 0));
    await store.insertPassages([
      { material_id, subject, page: 1, passage_idx: 0, text: "O Senado concedeu a Otávio o título de Augusto.", embedding: vec(1, 0) },
      { material_id, subject, page: 2, passage_idx: 0, text: "Os aquedutos levavam água às cidades romanas.", embedding: vec(0, 1) },
    ]);
    // Atlas builds search indexes asynchronously: wait until both answer queries.
    const db = mongoose.connection.db!;
    for (let i = 0; i < 60; i++) {
      const indexes = (await db.collection("chunks").listSearchIndexes().toArray()) as { queryable?: boolean }[];
      if (indexes.length >= 2 && indexes.every((x) => x.queryable)) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }, 180_000);

  afterAll(async () => {
    await mongoose.connection.db?.collection("chunks").deleteMany({ material_id });
    await mongoose.connection.db?.collection("materials").deleteMany({ subject });
    await disconnectMongo();
  });

  it("finds the closest passage by vector and by text, with the subject filter", async () => {
    const vec = Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0));
    const byVector = await store.vectorSearch(vec, 2, { subject });
    expect(byVector[0]?.page).toBe(1);
    const byText = await store.textSearch("aqueduto", 2, { subject });
    expect(byText[0]?.page).toBe(2);
    expect((await store.listCatalog()).some((m) => m.material_id === material_id)).toBe(true);
    expect((await store.getPagePassages(material_id, 1))[0]?.text).toContain("Senado");
  }, 60_000);
});
