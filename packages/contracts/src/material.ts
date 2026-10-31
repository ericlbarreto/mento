import { z } from "zod";

/**
 * One material (a book / PDF) of a subject. There is a single `materials` collection: the teacher's upload creates
 * the document and the whiteboard back-end reads it (catalog, subjects, retrieval). Field names follow the whiteboard
 * model (`pages`, `chapters`, `subject` = the subject key, `subject_id`); the upload adds the optional fields below.
 */

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

/** A chapter (title and page range). Stored as `chapters`; the PDF bookmarks or the headings found in the pages. */
export const OutlineItem = z.object({
  title: z.string(),
  start_page: z.number().int(),
  end_page: z.number().int(),
});
export type OutlineItem = z.infer<typeof OutlineItem>;

/** `queued` and `processing` are invisible to the tutor: only `ready` materials reach the catalog and the searches. */
export const MaterialStatus = z.enum(["queued", "processing", "ready", "failed"]);
export type MaterialStatus = z.infer<typeof MaterialStatus>;

export const IngestStage = z.enum(["queued", "extracting", "embedding", "done"]);
export type IngestStage = z.infer<typeof IngestStage>;

export const IngestProgress = z.object({ stage: IngestStage, done: z.number().int(), total: z.number().int() });
export type IngestProgress = z.infer<typeof IngestProgress>;

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
  /** The subject KEY (`history`), not its display name: it selects the tutor's subject profile and filters the passages. */
  subject: z.string().min(1),
  /** The subject (matéria) document the material belongs to. */
  subject_id: z.string().optional(),
  is_fixture: z.boolean().default(false),
  file: StoredFile.nullable().default(null),
  /** Number of pages (0 until the text is extracted). */
  pages: z.number().int().default(0),
  status: MaterialStatus.default("queued"),
  progress: IngestProgress.default({ stage: "queued", done: 0, total: 0 }),
  chapters: z.array(OutlineItem).default([]),
  sequence: z.array(Lesson).default([]),
  pages_needing_ocr: z.array(z.number().int()).default([]),
  /** Table-of-contents pages, left out of the search. */
  toc_pages: z.array(z.number().int()).default([]),
  /** Number of embedded passages stored in `chunks`. */
  passages: z.number().int().default(0),
  error: z.string().nullable().default(null),
});
export type MaterialInput = z.input<typeof MaterialInput>;

/** What is stored and returned. The defaults stay, so a material ingested by the whiteboard script (without the upload fields) reads fine. */
export const Material = MaterialInput.extend({
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Material = z.infer<typeof Material>;
