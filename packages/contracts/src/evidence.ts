import { z } from "zod";
import { Citation } from "./citation";

/** contracts-spec §5. `lesson_id` is the lab addition: which lesson of `material.sequence` the question belongs to. */
export const EvidenceResult = z.enum(["correct", "partial", "incorrect"]);
export type EvidenceResult = z.infer<typeof EvidenceResult>;

export const Evidence = z.object({
  id: z.string(),
  session_id: z.string(),
  student_id: z.string(),
  concept: z.string(),
  concept_key: z.string(),
  lesson_id: z.string().nullable().default(null),
  result: EvidenceResult,
  independent: z.boolean(),
  hints_used: z.number().int().nonnegative(),
  rationale: z.string(),
  citation: Citation.optional(),
  ts: z.string(),
});
export type Evidence = z.infer<typeof Evidence>;
