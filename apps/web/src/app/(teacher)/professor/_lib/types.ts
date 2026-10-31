// Owner: Person 1. View types for the teacher UI.
// Student, session, material and class context mirror the teacher API of PR #7 (feat/teacher-backend).
// The teacher flow is gap → insight → intervention:
//   - Gap: what one student does not understand, found in their chat (they said it, or the analysis inferred it).
//     Maps to PR #7 `Insight` with kind "gap".
//   - ClassInsight: what the teacher can conclude from the gaps of the whole class.
//   - Intervention: a proposal for the next class, built from the insights; the teacher adopts or dismisses it.
//     ClassInsight and Intervention are NOT in the PR #7 contracts yet (it has per-student "suggestion" rows):
//     they need an additive contract change agreed with Person 1 before the API wiring.

export type Severity = "critical" | "medium";
export type GradeLevel = "7º ano" | "8º ano" | "9º ano";
export type MaterialStatus = "queued" | "processing" | "ready" | "failed";

export interface Student {
  id: string;
  name: string;
  is_simulated: boolean;
  class_name: string | null;
  grade_level: GradeLevel | null;
}

/** One tutoring conversation (GET /students/:id/sessions). */
export interface SessionItem {
  id: string;
  student_id: string;
  topic: string | null;
  material_title: string | null;
  lesson_title: string | null;
  started_at: string;
  /** Summary of the analysis of this conversation, when it is done. */
  summary: string | null;
}

export interface Gap {
  id: string;
  student_id: string;
  session_id: string;
  concept: string;
  title: string;
  description: string;
  severity: Severity;
  /** "stated": the student said it in the chat; "inferred": the analysis concluded it from their answers. */
  origin: "stated" | "inferred";
  evidence: { event_id: string; quote: string }[];
  attempts: number;
  confidence: number;
  material_ref: { pages: [number, number] } | null;
  status: "open" | "resolved";
  created_at: string;
}

export interface ClassInsight {
  id: string;
  title: string;
  body: string;
  gap_ids: string[];
  created_at: string;
}

export type InterventionStatus = "suggested" | "adopted" | "dismissed";

export interface Intervention {
  id: string;
  title: string;
  duration_min: number;
  goal: string;
  steps: string[];
  insight_ids: string[];
  material_ref: { pages: [number, number] } | null;
  status: InterventionStatus;
}

export interface Material {
  id: string;
  title: string;
  pages: number;
  status: MaterialStatus;
  created_at: string;
  /** Where the PDF can be opened. The API serves it from its files route; the mock uses a static file or a blob URL. */
  file_url: string | null;
}

export interface ClassContext {
  grade_level: GradeLevel;
  description: string;
}

/** One teacher, one subject (prototype). */
export const SUBJECT = "História";

/** One question of an exercise list. `answer` and `explanation` only go to the teacher's copy. */
export interface Exercise {
  id: string;
  kind: "choice" | "open";
  prompt: string;
  options?: string[];
  answer: string;
  explanation: string;
  concept: string;
}

/** Questions generated from an intervention, to practise the class's gaps (Nice #18; mock until the API exists). */
export interface ExerciseSet {
  intervention_id: string;
  title: string;
  exercises: Exercise[];
  generated_at: string;
}
