// Owner: Person 1. Response shapes of the teacher API routes that @mento/contracts does not export as schemas.
// Insight, Student and ClassContext come from the contracts; these are the rest (see apps/api/src/controllers/teacher.controller.ts).
import { ClassContext, Insight } from "@mento/contracts";
import { z } from "zod";

const Counts = z.object({ critical: z.number(), medium: z.number(), positive: z.number() });

export const Overview = z.object({
  students: z.object({ total: z.number(), real: z.number(), simulated: z.number() }),
  conversations: z.number(),
  insights: z.object({ total: z.number(), gaps_identified: z.number(), gaps_open: z.number(), by_severity: Counts }),
});
export type Overview = z.infer<typeof Overview>;

export const StudentRowDto = z.object({
  id: z.string(),
  name: z.string(),
  is_simulated: z.boolean(),
  class_name: z.string().nullable(),
  grade_level: z.string().nullable(),
  conversations: z.number(),
  last_activity: z.string().nullable(),
  open_gaps: z.number(),
  insights: Counts,
});
export type StudentRowDto = z.infer<typeof StudentRowDto>;

export const InsightsDto = z.object({
  counts: Counts,
  critical: z.array(Insight),
  medium: z.array(Insight),
  positive: z.array(Insight),
});
export type InsightsDto = z.infer<typeof InsightsDto>;

export const SessionDto = z.object({
  id: z.string(),
  topic: z.string().nullable(),
  material_id: z.string().nullable(),
  material_title: z.string().nullable(),
  lesson_id: z.string().nullable(),
  lesson_title: z.string().nullable(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  analysis_status: z.string().nullable(),
  insight_count: z.number(),
  concepts: z.array(z.string()).default([]),
  questions: z.number().default(0),
  correct: z.number().default(0),
  incorrect: z.number().default(0),
});
export type SessionDto = z.infer<typeof SessionDto>;

export const StudentDetailDto = z.object({
  conversations: z.number(),
  latest_analysis: z
    .object({ session_id: z.string(), summary: z.string(), studying_lesson_id: z.string().nullable(), studying_lesson_title: z.string().nullable(), analyzed_at: z.string() })
    .nullable(),
});

export const EvolutionDto = z.array(
  z.object({
    concept: z.string(),
    concept_key: z.string(),
    n: z.number(),
    state: z.enum(["insufficient_evidence", "enough_evidence"]),
    series: z.array(
      z.object({ session_id: z.string(), started_at: z.string(), attempts: z.number(), correct: z.number(), partial: z.number(), incorrect: z.number(), independent_correct: z.number() }),
    ),
  }),
);
export type EvolutionDto = z.infer<typeof EvolutionDto>;

export { ClassContext, Insight };
