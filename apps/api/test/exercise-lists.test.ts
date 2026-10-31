import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { checkList } from "@mento/analysis";
import { fakeExerciseGenerator, makeApp } from "./helpers";

let open: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(open.map((a) => a.close()));
  open = [];
});
async function world(options: Parameters<typeof makeApp>[0] = {}) {
  const w = await makeApp({ analyzeAll: true, ...options });
  open.push(w.app);
  return w;
}

/** The open gaps of the class on one concept, as the intervention card sends them. */
async function gapsOf(app: FastifyInstance, conceptKey: string) {
  const all = (await app.inject("/api/insights?status=new,accepted")).json();
  return [...all.critical, ...all.medium].filter((i: { kind: string; concept_key: string }) => i.kind === "gap" && i.concept_key === conceptKey);
}

describe("exercise lists (D72)", () => {
  it("POST creates the list as generating (202), the generator writes it, GET shows it ready with 5 questions", async () => {
    const generator = fakeExerciseGenerator();
    const { app } = await world({ exerciseGenerator: generator });
    const gaps = await gapsOf(app, "formas de governo");
    expect(gaps.length).toBeGreaterThan(0);
    const created = await app.inject({ method: "POST", url: "/api/exercise-lists", payload: { concept: "Formas de governo", gap_ids: gaps.map((g: { id: string }) => g.id) } });
    expect(created.statusCode).toBe(202);
    expect(created.json()).toMatchObject({ status: "generating", concept_key: "formas de governo", student_count: 1, model: "fake-model", prompt_version: "exercises-v1" });
    await app.container.exercises.idle();
    const ready = (await app.inject(`/api/exercise-lists/${created.json().id}`)).json();
    expect(ready).toMatchObject({ status: "ready", title: "Lista sobre Formas de governo", error: null });
    expect(ready.exercises.map((e: { id: string; kind: string }) => `${e.id}:${e.kind}`)).toEqual(["q1:choice", "q2:choice", "q3:choice", "q4:open", "q5:open"]);
    expect(ready.exercises[3].options).toBeUndefined();
    expect((await app.inject("/api/exercise-lists")).json().map((l: { id: string }) => l.id)).toEqual([ready.id]);
  });

  it("the generator gets the lesson where the difficulty starts and the class context, never a student's name or words", async () => {
    const generator = fakeExerciseGenerator();
    const { app, repo } = await world({ exerciseGenerator: generator });
    const gaps = await gapsOf(app, "formas de governo");
    await app.inject({ method: "POST", url: "/api/exercise-lists", payload: { concept: "Formas de governo", gap_ids: gaps.map((g: { id: string }) => g.id) } });
    await app.container.exercises.idle();
    const source = generator.sources[0]!;
    expect(source).toMatchObject({ concept: "Formas de governo", grade_level: "8º ano" });
    expect(source.lesson?.title).toMatch(/Formas de governo/);
    expect(source.lesson?.summary).toBeTruthy(); // the lesson of the book, found from the gap's lesson of origin
    const list = (await app.inject("/api/exercise-lists")).json()[0];
    expect(list).toMatchObject({ material_title: expect.any(String), lesson_id: "L2", pages: [20, 25] });
    const text = JSON.stringify(source);
    for (const s of await repo.listStudents()) expect(text).not.toContain(s.name);
    const stored = await repo.getInsight(gaps[0].id);
    for (const e of stored!.evidence) expect(text).not.toContain(e.quote);
  });

  it("an invalid generation ends failed with the reason; delete removes the list", async () => {
    const bad = { model: "bad", async generate() { return { title: "x", questions: [] }; } };
    const { app } = await world({ exerciseGenerator: bad });
    const gaps = await gapsOf(app, "formas de governo");
    const created = (await app.inject({ method: "POST", url: "/api/exercise-lists", payload: { concept: "Formas de governo", gap_ids: [gaps[0].id] } })).json();
    await app.container.exercises.idle();
    expect((await app.inject(`/api/exercise-lists/${created.id}`)).json()).toMatchObject({ status: "failed", error: expect.stringContaining("3 choice") });
    expect((await app.inject({ method: "DELETE", url: `/api/exercise-lists/${created.id}` })).statusCode).toBe(204);
    expect((await app.inject(`/api/exercise-lists/${created.id}`)).statusCode).toBe(404);
  });

  it("without an API key it answers 503; unknown gaps are 400; an empty body is 400", async () => {
    const { app } = await world({ exerciseGenerator: null });
    const gaps = await gapsOf(app, "formas de governo");
    const noKey = await app.inject({ method: "POST", url: "/api/exercise-lists", payload: { concept: "Formas de governo", gap_ids: [gaps[0].id] } });
    expect(noKey.statusCode).toBe(503);
    expect(noKey.json().error).toBe("generator_unavailable");
    const { app: withKey } = await world();
    expect((await withKey.inject({ method: "POST", url: "/api/exercise-lists", payload: { concept: "X", gap_ids: ["nope"] } })).json().error).toBe("invalid_gaps");
    expect((await withKey.inject({ method: "POST", url: "/api/exercise-lists", payload: {} })).statusCode).toBe(400);
  });

  it("the live feed reports generating and ready", async () => {
    const { app } = await world();
    const seen: string[] = [];
    app.container.bus.subscribe((e) => e.type === "exercise_list_status" && seen.push(e.status));
    const gaps = await gapsOf(app, "formas de governo");
    await app.inject({ method: "POST", url: "/api/exercise-lists", payload: { concept: "Formas de governo", gap_ids: [gaps[0].id] } });
    await app.container.exercises.idle();
    expect(seen).toEqual(["generating", "ready"]);
  });

  it("checkList accepts exactly 3 choice questions with 4 options (answer among them) and 2 open ones", () => {
    const q = (kind: "choice" | "open", options: string[] | null = ["A", "B", "C", "D"], answer = "A") => ({ kind, prompt: "?", options, answer, explanation: "", page: null });
    const good = [q("choice"), q("choice"), q("choice"), q("open", null), q("open", null)];
    expect(checkList({ title: "t", questions: good })).toBeNull();
    expect(checkList({ title: "t", questions: [q("choice", ["A", "B", "C"]), ...good.slice(1)] })).toMatch(/4 options/);
    expect(checkList({ title: "t", questions: [q("choice", undefined, "Z"), ...good.slice(1)] })).toMatch(/one of its options/);
  });
});
