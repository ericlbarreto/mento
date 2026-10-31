// Owner: Person 1. View types for the teacher UI.
// Student, session, material and class context mirror the teacher API of PR #7 (feat/teacher-backend).
// The teacher flow is gap → topic → intervention (D71):
//   - Gap: a topic one student has difficulty with (API: Insight kind "gap"), never with their own words (D70).
//   - Topic: the open gaps of the whole class grouped by concept; the most frequent ones become interventions for the
//     next class, which the teacher adopts or dismisses (that decision applies to the students' suggestions).

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
  /** "done", "failed"… or null when the conversation was not analysed. */
  analysis_status?: string | null;
  insight_count?: number;
  /** null while the conversation was not ended (the analysis only runs after the end). */
  ended_at?: string | null;
  /** The concepts the tutor checked in it (from the analysis), the questions answered and how they went. */
  concepts?: string[];
  questions?: number;
  correct?: number;
  incorrect?: number;
}

export interface Gap {
  id: string;
  student_id: string;
  session_id: string;
  concept: string;
  title: string;
  description: string;
  severity: Severity;
  /** "stated": the student said it in the chat; "inferred": the analysis concluded it from their answers. The API does not tell them apart, so it leaves this out. */
  origin?: "stated" | "inferred";
  evidence: { event_id: string; quote: string }[];
  attempts: number;
  confidence: number;
  material_ref: { pages: [number, number] } | null;
  status: "open" | "resolved";
  created_at: string;
  /** Teacher already accepted it (API: status "accepted"). */
  accepted?: boolean;
  /** Where the analysis thinks it starts: this lesson, an earlier one, or something outside the material. */
  diagnosis?: "current_topic" | "prerequisite" | "outside_material" | null;
  root_cause?: { lesson_id: string; title: string; pages: [number, number]; taught_in_class?: boolean; reasoning: string } | null;
  /** The next step the analysis proposes for this gap. */
  suggestion?: Suggestion | null;
  /** Number of conversations that touched this gap, and in how many of them the answers were wrong. */
  sessions?: number;
  incorrect_sessions?: number;
  /** Rule of the analysis that produced it (R1, R3, M1…), which tells how firm the finding is. */
  rule?: string;
}

/** A per-student next step (API: Insight kind "suggestion"). */
export interface Suggestion {
  id: string;
  title: string;
  body: string;
  material_ref: { lesson_id: string; pages: [number, number] } | null;
  status: "new" | "accepted" | "dismissed" | "resolved";
}

/** A recognised strength (API: Insight kind "progress"). */
export interface Progress {
  id: string;
  concept: string;
  title: string;
  body: string;
  created_at: string;
  /** P2_resolved: a gap was overcome; P1_consistent: right more than once, unaided; P3_first_success: one right answer so far. */
  rule: string;
  /** Right answers without hints behind this finding. */
  independent_correct: number;
}

export type ConceptStep = "correct" | "partial" | "incorrect";
export type ConceptState = "consolidated" | "in_transition" | "sampling" | "gap";

/** One row of the concept map: what happened on this concept, conversation by conversation. */
export interface ConceptRow {
  concept_key: string;
  concept: string;
  n: number;
  steps: ConceptStep[];
  state: ConceptState;
}

/** Everything the student page shows. */
export interface StudentDetail {
  sessions: SessionItem[]; // newest first
  gaps: Gap[]; // open, most severe first
  resolved: Gap[];
  progress: Progress[];
  concepts: ConceptRow[];
  latest: { summary: string; lesson_title: string | null; topic: string | null; at: string } | null;
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
