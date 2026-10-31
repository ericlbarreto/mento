import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoRepository, connectMongo, disconnectMongo } from "@mento/db";
import { MemoryFileStore, ingestMaterial, validateCitation } from "../src/upload";
import { TEST_DB, mongoTestUri } from "./mongo-env";
import { book, queuedMaterial } from "./helpers";

const uri = mongoTestUri();

describe.skipIf(!uri)("ingestion on MongoDB (database mento_test_sources)", () => {
  const repo = new MongoRepository();
  beforeAll(async () => {
    await connectMongo(uri!, { dbName: TEST_DB });
    await mongoose.connection.dropDatabase();
    await repo.syncIndexes();
  }, 60_000);
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
  }, 30_000);

  it("BR-23 a real PDF is ingested; the Portuguese text index finds 'fim da república' on the right page; citations are validated", async () => {
    const store = new MemoryFileStore();
    const m = await queuedMaterial(repo, store, book());
    const out = await ingestMaterial(m.id, { repo, store });
    expect(out?.status).toBe("ready");
    expect((await repo.getMaterial(m.id))?.progress).toEqual({ done: 4, total: 4 });

    const hits = await repo.searchChunks(m.id, "fim da república", 3);
    expect(hits[0]?.page).toBe(2);
    expect((await repo.searchChunks(m.id, "coliseu", 3))[0]?.page).toBe(3);
    expect(await validateCitation(repo, { material_id: m.id, page: 2, quote: "o FIM da republica aconteceu" })).toBe(true);
    expect(await validateCitation(repo, { material_id: m.id, page: 2, quote: "Júlio César foi assassinado" })).toBe(false);
  });
});
