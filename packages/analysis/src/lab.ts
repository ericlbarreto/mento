import { readFileSync } from "node:fs";
import { ClassContext, Lesson, StudentInput, type Material, type TeacherRepository } from "@mento/contracts";
import { z } from "zod";

/** Dev/test helpers for the fixtures in `fixtures/` (the only mocked data: students; plus the lab material and conversations). */
const root = new URL("../../../fixtures/", import.meta.url);
export const LAB_CONVERSATIONS_PATH = new URL("analysis-lab/conversations.json", root).pathname;
const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, root), "utf8"));

export const LAB_MATERIAL_FIXTURE_ID = "mat_roma";

export function loadSeedStudents() {
  return z.object({ students: z.array(StudentInput) }).parse(read("seed/students.json")).students;
}
export function loadSeedClassContext() {
  return ClassContext.parse(read("seed/class-context.json"));
}
export function loadLabMaterial() {
  const raw = z
    .object({ id: z.string(), title: z.string(), subject: z.string(), page_count: z.number().int(), sequence: z.array(Lesson) })
    .parse(read("analysis-lab/material.json"));
  return raw;
}

/** `pnpm seed`: the mocked students and the class context. Idempotent (upsert by fixture_id). */
export async function seedStudents(repo: TeacherRepository) {
  const students = [];
  for (const input of loadSeedStudents()) students.push(await repo.upsertStudent(input));
  await repo.setClassContext(loadSeedClassContext());
  return students;
}

/** `pnpm seed:lab`: the lab material (metadata + lesson sequence; no PDF, so no passages), flagged `is_fixture`. Idempotent. */
export async function seedLabMaterial(repo: TeacherRepository): Promise<Material> {
  const m = loadLabMaterial();
  return repo.upsertMaterial({
    fixture_id: LAB_MATERIAL_FIXTURE_ID,
    title: m.title,
    subject: "history",
    is_fixture: true, // never shown to the tutor: no catalog entry, no subject count
    pages: m.page_count,
    status: "ready",
    progress: { stage: "done", done: m.page_count, total: m.page_count },
    chapters: m.sequence.map((l) => ({ title: l.title, start_page: l.pages[0], end_page: l.pages[1] })),
    sequence: m.sequence,
  });
}
