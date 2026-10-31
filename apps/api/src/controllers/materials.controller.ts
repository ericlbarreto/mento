import { createHash } from "node:crypto";
import { SubjectName, type Material } from "@mento/contracts";
import type { Container } from "../container";
import { HttpError, badRequest, notFound } from "../lib/errors";

export const listMaterials = (c: Container) => c.teacherRepo.listMaterials();

export async function getMaterial(c: Container, id: string): Promise<Material> {
  return (await c.teacherRepo.getMaterial(id)) ?? Promise.reject(notFound("material"));
}

export interface UploadInput {
  title?: string | undefined;
  subject?: string | undefined;
  filename?: string | undefined;
  data: Buffer;
}

/**
 * Accepts a PDF: validates it, de-duplicates by sha256, stores it and queues the background ingestion.
 * The same file uploaded twice returns the existing material (`duplicate: true`).
 */
export async function uploadMaterial(c: Container, input: UploadInput) {
  if (input.data.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(415, "only PDF files are accepted");
  const subject = SubjectName.safeParse(input.subject);
  if (!subject.success) throw badRequest(`subject must be one of: ${SubjectName.options.join(", ")}`);

  const sha256 = createHash("sha256").update(input.data).digest("hex");
  const existing = await c.teacherRepo.findMaterialBySha256(sha256);
  if (existing) return { id: existing.id, status: existing.status, duplicate: true };

  const key = `${sha256}.pdf`;
  await c.fileStore.put(key, input.data);
  const title = input.title?.trim() || input.filename?.replace(/\.pdf$/i, "") || "Material sem título";
  const material = await c.teacherRepo.upsertMaterial({
    title,
    subject: subject.data,
    status: "queued",
    file: { key, size: input.data.length, sha256, mime: "application/pdf" },
  });
  c.ingest.enqueue(material.id);
  return { id: material.id, status: material.status, duplicate: false };
}
