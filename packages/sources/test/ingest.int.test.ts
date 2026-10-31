import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoChunkStore, MongoRepository, MongoSubjectStore, connectMongo, disconnectMongo } from "@mento/db";
import { MemoryFileStore, ingestMaterial } from "../src";
import { createRetriever } from "../src/retriever";
import { TEST_DB, mongoTestUri } from "./mongo-env";
import { book, embed, queuedMaterial } from "./helpers";

const uri = mongoTestUri();

describe.skipIf(!uri)("upload ingestion on MongoDB (database mento_test_sources)", () => {
  const repo = new MongoRepository();
  const chunks = new MongoChunkStore();
  const subjects = new MongoSubjectStore();
  beforeAll(async () => {
    await connectMongo(uri!, { dbName: TEST_DB });
    await mongoose.connection.dropDatabase();
    await repo.syncIndexes();
  }, 60_000);
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
  }, 30_000);

  it("BR-23 a real PDF becomes one material in `materials` plus embedded passages in `chunks`, linked to its subject", async () => {
    const subject = await subjects.create({ name: "História", key: "history" });
    const files = new MemoryFileStore();
    const m = await queuedMaterial(repo, files, book(), "Livro", { key: subject.key, id: subject.id });
    const out = await ingestMaterial(m.id, { repo, chunks, files, embed });
    expect(out).toMatchObject({ status: "ready", pages: 4, subject: "history", subject_id: subject.id });

    const raw = mongoose.connection.db!;
    expect(await raw.collection("materials").countDocuments({ _id: new mongoose.Types.ObjectId(m.id) })).toBe(1);
    const stored = await raw.collection("chunks").find({ material_id: m.id }).toArray();
    expect(stored.length).toBe(out!.passages);
    expect(stored[0]).toMatchObject({ material_id: m.id, subject: "history", embedding: expect.any(Array) });
    expect(stored.every((c) => c.embedding.length === 32)).toBe(true);

    // the whiteboard side reads the same document: catalog and subject summary
    expect((await chunks.listCatalog(subject.id)).map((c) => c.title)).toEqual(["Livro"]);
    expect(await subjects.get(subject.id)).toMatchObject({ material_count: 1, materials: [{ id: m.id, title: "Livro", pages: 4, status: "ready" }] });

    const retriever = createRetriever({ store: chunks, embed });
    expect(await retriever.validateCitation({ material_id: m.id, page: 2, quote: "O fim da República aconteceu" })).toBe(true);
    expect(await retriever.validateCitation({ material_id: m.id, page: 2, quote: "Júlio César foi assassinado" })).toBe(false);
  }, 60_000);

  it("BR-22 a failing ingestion on MongoDB leaves a failed material and no passages; the catalog stays empty for it", async () => {
    const files = new MemoryFileStore();
    const m = await queuedMaterial(repo, files, book(), "Falha");
    const out = await ingestMaterial(m.id, { repo, chunks, files, embed: async () => Promise.reject(new Error("boom")) });
    expect(out).toMatchObject({ status: "failed", error: "boom" });
    expect(await mongoose.connection.db!.collection("chunks").countDocuments({ material_id: m.id })).toBe(0);
    expect((await chunks.listCatalog()).some((c) => c.title === "Falha")).toBe(false);
  }, 60_000);

  it("BR-26 a fixture material is stored with the others but never reaches the catalog or a subject", async () => {
    const subject = await subjects.upsertByKey("history", "História");
    await repo.upsertMaterial({ fixture_id: "mat_lab", title: "Apostila de laboratório", subject: "history", subject_id: subject.id, is_fixture: true, status: "ready", pages: 68 });
    expect((await repo.getMaterialByFixtureId("mat_lab"))?.is_fixture).toBe(true);
    expect((await chunks.listCatalog()).some((c) => c.title === "Apostila de laboratório")).toBe(false);
    expect((await subjects.get(subject.id))?.materials.some((x) => x.title === "Apostila de laboratório")).toBe(false);
  });

  it("BR-26 materials ingested by the whiteboard script (no upload fields) are read by the teacher repository with defaults", async () => {
    const { id } = await chunks.createMaterial({ title: "Do script", subject: "history", chapters: [{ title: "Cap 1", start_page: 1, end_page: 3 }], pages: 3, status: "ready" });
    expect(await repo.getMaterial(id)).toMatchObject({
      id, title: "Do script", subject: "history", pages: 3, status: "ready", file: null, sequence: [], passages: 0, is_fixture: false, chapters: [{ title: "Cap 1", start_page: 1, end_page: 3 }],
    });
  });
});
