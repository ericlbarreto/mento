import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoRepository, connectMongo, disconnectMongo } from "@mento/db";
import { AnalysisService, FileConversationSource, LAB_CONVERSATIONS_PATH, idMapsFromRepo, seedLabMaterial, seedStudents, loadSeedStudents } from "../src";
import { analyzeAll, labWorld } from "./helpers";
import { TEST_DB, mongoTestUri } from "./mongo-env";

const counts = async (repo: { listStudents(): Promise<unknown[]>; listMaterials(): Promise<unknown[]>; listInsights(): Promise<unknown[]> }) => ({
  students: (await repo.listStudents()).length,
  materials: (await repo.listMaterials()).length,
  insights: (await repo.listInsights()).length,
});

describe("seeds are idempotent (BR-20)", () => {
  it("BR-20 the mocked students are complete: profile, guardian, 2 school years of 8 subjects, current term; exactly one is not simulated", () => {
    const students = loadSeedStudents();
    expect(students).toHaveLength(6);
    expect(students.filter((s) => !s.is_simulated).map((s) => s.name)).toEqual(["Lucas Ferreira"]);
    for (const s of students) {
      expect(s.profile).toMatchObject({ class_name: "8º A", grade_level: "8º ano" });
      expect(s.profile?.guardian.email).toMatch(/@example\.com$/);
      expect(s.school_history?.map((y) => y.grade_level)).toEqual(["6º ano", "7º ano"]);
      for (const year of s.school_history ?? []) expect(year.subjects).toHaveLength(8);
      expect(s.current_term).toHaveLength(8);
    }
    expect(new Set(students.map((s) => s.fixture_id)).size).toBe(6);
  });

  it("BR-20 running seed and seed:lab twice, then the analysis twice, leaves the same data (memory)", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    const first = await counts(w.repo);
    const ids = (await w.repo.listStudents()).map((s) => s.id);

    await seedStudents(w.repo);
    await seedLabMaterial(w.repo);
    await analyzeAll(w);
    expect(await counts(w.repo)).toEqual(first);
    expect((await w.repo.listStudents()).map((s) => s.id)).toEqual(ids);
    expect(first).toEqual({ students: 6, materials: 1, insights: 17 });
  });
});

const uri = mongoTestUri();
describe.skipIf(!uri)("seeds on MongoDB (database mento_test_analysis)", () => {
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

  const analyze = async () => {
    const conversations = new FileConversationSource(LAB_CONVERSATIONS_PATH, idMapsFromRepo(repo));
    const service = new AnalysisService({ repo, conversations });
    for (const s of await conversations.listAllSessions()) await service.run(s.id);
  };

  it("BR-20 seed, seed:lab and the analysis twice give 6 students, 1 material, 8 analyses and 17 insights both times; chunks stay empty", async () => {
    const run = async () => {
      await seedStudents(repo);
      await seedLabMaterial(repo);
      await analyze();
    };
    await run();
    const snapshot = async () => ({
      ...(await counts(repo)),
      analyses: await mongoose.connection.db!.collection("analyses").countDocuments(),
      chunks: await mongoose.connection.db!.collection("chunks").countDocuments(),
    });
    const first = await snapshot();
    await run();
    expect(await snapshot()).toEqual(first);
    expect(first).toEqual({ students: 6, materials: 1, insights: 17, analyses: 8, chunks: 0 });
  }, 60_000);

  it("BR-20 reset clears only the teacher collections: whiteboard collections and real materials survive", async () => {
    const db = mongoose.connection.db!;
    await db.collection("sessions").insertOne({ _id: "keep-me" as never, note: "written by the whiteboard (Person 3)" });
    await repo.upsertMaterial({ title: "Livro real do Eric", subject: "history", status: "ready", pages: 10 });
    await repo.resetTeacherData();
    expect(await counts(repo)).toEqual({ students: 0, materials: 1, insights: 0 }); // the fixture material went, the real one stayed
    expect(await db.collection("analyses").countDocuments()).toBe(0);
    expect(await db.collection("sessions").countDocuments()).toBe(1);
  });
});
