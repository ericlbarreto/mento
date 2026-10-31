import { z } from "zod";

export const RULES_VERSION = "rules-v1";

export const Severity = z.enum(["critical", "medium", "positive"]);
export type Severity = z.infer<typeof Severity>;

export const InsightKind = z.enum(["gap", "progress", "suggestion"]);
export type InsightKind = z.infer<typeof InsightKind>;

export const InsightStatus = z.enum(["new", "accepted", "dismissed", "resolved"]);
export type InsightStatus = z.infer<typeof InsightStatus>;

/** Deterministic rules (rules-v1). The first rule that matches wins. */
export const RuleId = z.enum([
  "P2_resolved",
  "R3_recurring",
  "R1_repeated_errors",
  "M1_single_error",
  "M2_needs_hints",
  "P1_consistent",
  "P3_first_success",
]);
export type RuleId = z.infer<typeof RuleId>;

export const Diagnosis = z.enum(["current_topic", "prerequisite", "outside_material"]);
export type Diagnosis = z.infer<typeof Diagnosis>;

export const InsightEvidence = z.object({ event_id: z.string(), quote: z.string() });
export type InsightEvidence = z.infer<typeof InsightEvidence>;

export const RootCause = z.object({
  lesson_id: z.string(),
  title: z.string(),
  pages: z.tuple([z.number().int(), z.number().int()]),
  taught_in_class: z.boolean(),
  reasoning: z.string(),
});
export type RootCause = z.infer<typeof RootCause>;

export const MaterialRef = z.object({
  lesson_id: z.string(),
  pages: z.tuple([z.number().int(), z.number().int()]),
});
export type MaterialRef = z.infer<typeof MaterialRef>;

export const ConceptMetrics = z.object({
  attempts: z.number().int(),
  correct: z.number().int(),
  partial: z.number().int(),
  incorrect: z.number().int(),
  independent_correct: z.number().int(),
  hints_used: z.number().int(),
  sessions: z.number().int(),
  incorrect_sessions: z.number().int(),
  last_attempts: z.number().int(),
  last_incorrect: z.number().int(),
  last_independent_correct: z.number().int(),
  earlier_incorrect: z.number().int(),
});
export type ConceptMetrics = z.infer<typeof ConceptMetrics>;

/** What the teacher sees. `gap`/`progress` carry the analysis; `suggestion` rows hang from a gap via `related_gap_id`. */
export const Insight = z.object({
  id: z.string(),
  student_id: z.string(),
  session_id: z.string(),
  analysis_id: z.string(),
  kind: InsightKind,
  severity: Severity,
  rule: RuleId,
  rules_version: z.string(),
  concept: z.string(),
  concept_key: z.string(),
  title: z.string(),
  body: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(InsightEvidence),
  diagnosis: Diagnosis.nullable(),
  root_cause: RootCause.nullable(),
  studying_lesson_id: z.string().nullable(),
  related_gap_id: z.string().nullable(),
  material_ref: MaterialRef.nullable(),
  metrics: ConceptMetrics,
  source: z.enum(["llm", "template"]),
  status: InsightStatus,
  created_at: z.string(),
  updated_at: z.string(),
});
export type Insight = z.infer<typeof Insight>;
export type InsightDraft = Omit<Insight, "id" | "created_at" | "updated_at">;

export const InsightFilter = z.object({
  student_id: z.string().optional(),
  session_id: z.string().optional(),
  kind: InsightKind.optional(),
  severity: Severity.optional(),
  status: z.array(InsightStatus).optional(),
  concept_key: z.string().optional(),
});
export type InsightFilter = z.infer<typeof InsightFilter>;

// ---- Analysis input (pure function of conversations + material + class context) ----

export const Counters = z.object({
  user_messages: z.number().int(),
  hints_given: z.number().int(),
  verifications: z.number().int(),
  correct: z.number().int(),
  partial: z.number().int(),
  incorrect: z.number().int(),
  independent_correct: z.number().int(),
});
export type Counters = z.infer<typeof Counters>;

export const Turn = z.object({
  event_id: z.string(),
  role: z.enum(["student", "tutor"]),
  purpose: z.string().optional(),
  text: z.string(),
});
export type Turn = z.infer<typeof Turn>;

export const InputEvidence = z.object({
  id: z.string(),
  concept: z.string(),
  concept_key: z.string(),
  lesson_id: z.string().nullable(),
  result: z.enum(["correct", "partial", "incorrect"]),
  independent: z.boolean(),
  hints_used: z.number().int(),
  rationale: z.string(),
  ts: z.string(),
  answer_event_id: z.string().nullable(),
  answer: z.string().nullable(),
});
export type InputEvidence = z.infer<typeof InputEvidence>;

export const InputSession = z.object({
  session_id: z.string(),
  topic: z.string().nullable(),
  lesson_id: z.string().nullable(),
  started_at: z.string(),
  counters: Counters,
  evidence: z.array(InputEvidence),
  turns: z.array(Turn),
});
export type InputSession = z.infer<typeof InputSession>;

export const AnalysisInput = z.object({
  student_id: z.string(),
  trigger_session_id: z.string(),
  studying_lesson_id: z.string().nullable(),
  rules_version: z.string(),
  class_context: z.object({ grade_level: z.string(), description: z.string() }).nullable(),
  material: z.object({
    id: z.string(),
    title: z.string(),
    subject: z.string(),
    sequence: z.array(z.any()),
  }),
  skip_reason: z.enum(["short_session"]).nullable(),
  /** Sessions of the student up to and including the trigger session, oldest first. */
  sessions: z.array(InputSession),
});
export type AnalysisInput = Omit<z.infer<typeof AnalysisInput>, "material"> & {
  material: { id: string; title: string; subject: string; sequence: import("./material").Lesson[] };
};

// ---- Findings (output of the deterministic rules) ----

export const Finding = z.object({
  concept: z.string(),
  concept_key: z.string(),
  kind: z.enum(["gap", "progress"]),
  rule: RuleId,
  severity: Severity,
  confidence: z.number(),
  metrics: ConceptMetrics,
  lesson_ids: z.array(z.string()),
  diagnosis: Diagnosis.nullable(),
  root_cause: RootCause.omit({ reasoning: true }).nullable(),
  /** Student answers that justify the finding, oldest first (max 3). */
  evidence: z.array(InsightEvidence),
});
export type Finding = z.infer<typeof Finding>;

// ---- Writer output (template or LLM) ----

export const WriterInsight = z.object({
  concept_key: z.string(),
  rule: RuleId,
  severity: Severity,
  title: z.string(),
  body: z.string(),
  confidence: z.number().optional(),
  /** The only diagnosis an LLM may add: a skill the material assumes but does not teach. */
  diagnosis: z.literal("outside_material").optional(),
  reasoning: z.string().optional(),
  evidence: z.array(InsightEvidence).optional(),
  suggestion: z
    .object({
      title: z.string(),
      body: z.string(),
      material_ref: MaterialRef.nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type WriterInsight = z.infer<typeof WriterInsight>;

export const WriterOutput = z.object({
  summary: z.string(),
  insights: z.array(WriterInsight),
});
export type WriterOutput = z.infer<typeof WriterOutput>;

export const AnalysisStatus = z.enum(["pending", "running", "done", "failed"]);
export type AnalysisStatus = z.infer<typeof AnalysisStatus>;

export const Rejection = z.object({ concept_key: z.string(), reason: z.string() });
export type Rejection = z.infer<typeof Rejection>;

export const Analysis = z.object({
  id: z.string(),
  session_id: z.string(),
  student_id: z.string(),
  status: AnalysisStatus,
  attempts: z.number().int(),
  input_hash: z.string().nullable(),
  rules_version: z.string(),
  writer: z.string().nullable(),
  prompt_version: z.string().nullable(),
  skip_reason: z.string().nullable(),
  studying_lesson_id: z.string().nullable(),
  counters: Counters.nullable(),
  findings: z.array(Finding),
  summary: z.string().nullable(),
  rejections: z.array(Rejection),
  insight_ids: z.array(z.string()),
  error: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Analysis = z.infer<typeof Analysis>;
export type AnalysisRecord = Omit<Analysis, "id" | "created_at" | "updated_at">;

// ---- Learner summary (for the tutor, Person 3): concepts only, never names or profile ----

export const LearnerSummary = z.object({
  open_gaps: z.array(
    z.object({ concept: z.string(), concept_key: z.string(), description: z.string(), confidence: z.number() }),
  ),
  recent_progress: z.array(z.object({ concept: z.string(), description: z.string() })),
});
export type LearnerSummary = z.infer<typeof LearnerSummary>;

// ---- Live feed for the teacher UI (SSE) ----

export type TeacherEvent =
  | { type: "analysis_status"; session_id: string; student_id: string; status: AnalysisStatus }
  | { type: "insight_created"; insight: Insight }
  | { type: "material_status"; material_id: string; status: string; progress: { done: number; total: number } }
  | { type: "exercise_list_status"; list_id: string; status: "generating" | "ready" | "failed" };
