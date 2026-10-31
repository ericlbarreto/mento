import { z } from "zod";

export const SubjectName = z.enum(["História", "Matemática", "Ciências", "Português", "Geografia", "Outro"]);
export type SubjectName = z.infer<typeof SubjectName>;

/** One lesson of the material, in teaching order. The analysis traces difficulties through `prerequisites`. */
export const Lesson = z.object({
  lesson_id: z.string(),
  order: z.number().int(),
  title: z.string(),
  pages: z.tuple([z.number().int(), z.number().int()]),
  taught_in_class: z.boolean(),
  summary: z.string(),
  key_concepts: z.array(z.string()),
  activities: z.array(z.string()),
  prerequisites: z.array(z.string()),
});
export type Lesson = z.infer<typeof Lesson>;

export const OutlineItem = z.object({
  title: z.string(),
  start_page: z.number().int(),
  end_page: z.number().int(),
});
export type OutlineItem = z.infer<typeof OutlineItem>;

export const MaterialStatus = z.enum(["queued", "processing", "ready", "failed"]);
export type MaterialStatus = z.infer<typeof MaterialStatus>;

export const StoredFile = z.object({
  key: z.string(),
  size: z.number().int(),
  sha256: z.string(),
  mime: z.string(),
});
export type StoredFile = z.infer<typeof StoredFile>;

export const MaterialInput = z.object({
  fixture_id: z.string().optional(),
  title: z.string().min(1),
  subject: SubjectName,
  is_fixture: z.boolean().default(false),
  file: StoredFile.nullable().default(null),
  page_count: z.number().int().default(0),
  status: MaterialStatus.default("queued"),
  progress: z.object({ done: z.number().int(), total: z.number().int() }).default({ done: 0, total: 0 }),
  outline: z.array(OutlineItem).default([]),
  sequence: z.array(Lesson).default([]),
  pages_needing_ocr: z.array(z.number().int()).default([]),
  error: z.string().nullable().default(null),
});
export type MaterialInput = z.input<typeof MaterialInput>;

export const Material = MaterialInput.extend({
  id: z.string(),
  is_fixture: z.boolean(),
  file: StoredFile.nullable(),
  page_count: z.number().int(),
  status: MaterialStatus,
  progress: z.object({ done: z.number().int(), total: z.number().int() }),
  outline: z.array(OutlineItem),
  sequence: z.array(Lesson),
  pages_needing_ocr: z.array(z.number().int()),
  error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Material = z.infer<typeof Material>;

/** A text piece of a teacher-uploaded material page, for search and citation checks (not used by the analysis). The whiteboard's embedded passages are `Chunk` in ./retrieval. */
export const TextChunk = z.object({
  material_id: z.string(),
  page: z.number().int().positive(),
  chunk_index: z.number().int().nonnegative(),
  chapter: z.string().nullable().default(null),
  text: z.string(),
  text_norm: z.string(),
});
export type TextChunk = z.infer<typeof TextChunk>;
