import { createHash } from "node:crypto";
import type { Material } from "@mento/contracts";
import type { Container } from "../container";
import { HttpError, badRequest, notFound } from "../lib/errors";

export const listMaterials = (c: Container) => c.teacherRepo.listMaterials();

export async function getMaterial(c: Container, id: string): Promise<Material> {
  return (await c.teacherRepo.getMaterial(id)) ?? Promise.reject(notFound("material"));
}

export interface UploadInput {
  title?: string | undefined;
  subject_id?: string | undefined;
  filename?: string | undefined;
  data: Buffer;
}

export type UploadResult =
  | { ok: true; id: string; status: string; duplicate: boolean }
  | { ok: false; status: 404; error: "subject_not_found" };

/**
 * Accepts a PDF for a subject: validates it, de-duplicates by sha256 (the same file returns the existing material),
 * stores it and queues the background job (text → chapters → embeddings in `chunks` → lesson sequence → `ready`).
 * The material only reaches the tutor and the subject once it is `ready`.
 */
export async function uploadMaterial(c: Container, input: UploadInput): Promise<UploadResult> {
  if (input.data.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(415, "only PDF files are accepted");
  if (!input.subject_id) throw badRequest("subject_id is required: choose the subject (matéria) of this material");
  const subject = await c.subjects.get(input.subject_id);
  if (!subject) return { ok: false, status: 404, error: "subject_not_found" };

  const sha256 = createHash("sha256").update(input.data).digest("hex");
  const existing = await c.teacherRepo.findMaterialBySha256(sha256);
  if (existing) return { ok: true, id: existing.id, status: existing.status, duplicate: true };

  const key = `${sha256}.pdf`;
  await c.fileStore.put(key, input.data);
  const title = input.title?.trim() || input.filename?.replace(/\.pdf$/i, "") || "Material sem título";
  const material = await c.teacherRepo.upsertMaterial({
    title,
    subject: subject.key, // the subject KEY (history): what the tutor and the passages use
    subject_id: subject.id,
    status: "queued",
    file: { key, size: input.data.length, sha256, mime: "application/pdf" },
    progress: { stage: "queued", done: 0, total: 0 },
  });
  c.ingest.enqueue(material.id);
  return { ok: true, id: material.id, status: material.status, duplicate: false };
}
