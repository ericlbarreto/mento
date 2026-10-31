import { z } from "zod";

/** Stable machine key of a subject ("history", "math"): also selects the tutor's subject profile. */
export const SubjectKey = z.string().regex(/^[a-z][a-z0-9_-]{0,40}$/, "subject key must be a lowercase slug");

export const MaterialSummary = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  pages: z.number().int().min(0),
  status: z.enum(["processing", "ready", "failed"]),
});
export type MaterialSummary = z.infer<typeof MaterialSummary>;

export const Subject = z.object({
  id: z.string().min(1),
  /** Display name in Portuguese ("História"). */
  name: z.string().min(1).max(60),
  key: SubjectKey,
});
export type Subject = z.infer<typeof Subject>;

/** A subject as the start screen shows it: its ready materials and how many there are. */
export const SubjectSummary = Subject.extend({
  material_count: z.number().int().min(0),
  materials: z.array(MaterialSummary),
});
export type SubjectSummary = z.infer<typeof SubjectSummary>;

export const ListSubjectsResponse = z.object({ subjects: z.array(SubjectSummary) });
export type ListSubjectsResponse = z.infer<typeof ListSubjectsResponse>;

export const CreateSubjectRequest = z.object({ name: z.string().min(1).max(60), key: SubjectKey });
export type CreateSubjectRequest = z.infer<typeof CreateSubjectRequest>;
