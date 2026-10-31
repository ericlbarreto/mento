import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ListSubjectsResponse, SubjectSummary, type CreateSubjectRequest, type Subject, type SubjectStore } from "@mento/contracts";
import { buildApp } from "../app";
import { loadConfig } from "../config";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const history: SubjectSummary = {
  id: "6650f0c2a1b2c3d4e5f60701",
  name: "História",
  key: "history",
  material_count: 1,
  materials: [{ id: "m1", title: "História de Roma Antiga I", pages: 489, status: "ready" }],
};

export function fakeSubjects(initial: SubjectSummary[] = [history]): SubjectStore {
  const items = [...initial];
  return {
    list: async () => items,
    get: async (id) => items.find((s) => s.id === id) ?? null,
    create: async (input: CreateSubjectRequest): Promise<Subject> => {
      if (items.some((s) => s.key === input.key)) throw Object.assign(new Error("taken"), { name: "SubjectKeyTakenError" });
      const subject = { id: `new_${input.key}`, ...input };
      items.push({ ...subject, material_count: 0, materials: [] });
      return subject;
    },
    upsertByKey: async (key, name) => ({ id: `k_${key}`, key, name }),
  };
}

const config = loadConfig({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv);
const start = async (dbReady = true) => (app = await buildApp(config, { subjects: fakeSubjects(), dbReady: () => dbReady }));

describe("subjects", () => {
  it("lists subjects with their material counts", async () => {
    await start();
    const res = await app!.inject({ url: "/api/subjects" });
    expect(res.statusCode).toBe(200);
    expect(ListSubjectsResponse.parse(res.json()).subjects[0]).toMatchObject({ name: "História", material_count: 1 });
  });

  it("returns one subject or 404", async () => {
    await start();
    expect(SubjectSummary.parse((await app!.inject({ url: `/api/subjects/${history.id}` })).json()).key).toBe("history");
    expect((await app!.inject({ url: "/api/subjects/nope" })).statusCode).toBe(404);
  });

  it("creates a subject, rejects a duplicate key with 409 and a bad key with 400", async () => {
    await start();
    const created = await app!.inject({ method: "POST", url: "/api/subjects", payload: { name: "Matemática", key: "math" } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({ id: "new_math", name: "Matemática", key: "math" });
    expect((await app!.inject({ method: "POST", url: "/api/subjects", payload: { name: "Outra", key: "history" } })).statusCode).toBe(409);
    expect((await app!.inject({ method: "POST", url: "/api/subjects", payload: { name: "X", key: "Com Espaço" } })).statusCode).toBe(400);
  });

  it("answers 503 while the database is not connected", async () => {
    await start(false);
    expect((await app!.inject({ url: "/api/subjects" })).statusCode).toBe(503);
  });
});

describe("sessions with a subject", () => {
  const post = (payload: unknown) => app!.inject({ method: "POST", url: "/api/sessions", payload: payload as Record<string, unknown> });

  it("starts a session from a subject and echoes its id", async () => {
    await start();
    const res = await post({ student_id: "stu_1", modality: "voice", subject_id: history.id });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ subject_id: history.id });
    const { id } = res.json() as { id: string };
    const session = await app!.container.repo.getSession(id);
    expect(session?.subject).toEqual({ id: history.id, name: "História", key: "history" });
  });

  it("starts a free whiteboard with no subject or a null one", async () => {
    await start();
    expect((await post({ student_id: "stu_1", modality: "voice" })).json()).toMatchObject({ subject_id: null });
    expect((await post({ student_id: "stu_1", modality: "voice", subject_id: null })).json()).toMatchObject({ subject_id: null });
  });

  it("answers 404 for an unknown subject and 503 when it cannot be checked", async () => {
    await start();
    expect((await post({ student_id: "stu_1", modality: "voice", subject_id: "nope" })).statusCode).toBe(404);
    await app!.close();
    await start(false);
    expect((await post({ student_id: "stu_1", modality: "voice", subject_id: history.id })).statusCode).toBe(503);
  });
});
