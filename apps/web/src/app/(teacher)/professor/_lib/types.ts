// Owner: Person 1. View types for the teacher UI.
// They mirror the response shapes of the teacher API in PR #7 (feat/teacher-backend: packages/contracts insights,
// material, student, class-context and packages/analysis queries). Swap for @mento/contracts once it lands.

export type Severity = "critical" | "medium" | "positive";
export type InsightKind = "gap" | "progress" | "suggestion";
export type InsightStatus = "new" | "accepted" | "dismissed" | "resolved";
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

export interface Insight {
  id: string;
  student_id: string;
  session_id: string;
  kind: InsightKind;
  severity: Severity;
  concept: string;
  title: string;
  body: string;
  confidence: number;
  evidence: { event_id: string; quote: string }[];
  related_gap_id: string | null;
  material_ref: { lesson_id: string; pages: [number, number] } | null;
  metrics: { attempts: number };
  status: InsightStatus;
  created_at: string;
}

export interface Material {
  id: string;
  title: string;
  subject: string;
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
