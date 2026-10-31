/**
 * What the whiteboard back-end stores in MongoDB (`sessions`, `events`, `evidences`), as plain objects, and the interface
 * that reads it. The analysis maps these to its own `SessionBundle` (see `toSessionBundle` in @mento/analysis).
 */
export interface StoredSession {
  id: string;
  student_id: string;
  modality: "text" | "voice";
  /** `null` = free whiteboard. */
  subject_id?: string | null;
  topic?: string | null;
  title?: string | null;
  started_at: Date | string;
  ended_at?: Date | string | null;
  end_reason?: string | null;
}

export interface StoredEvent {
  id: string;
  session_id: string;
  ts: Date | string;
  type: string;
  payload: unknown;
}

export interface StoredEvidence {
  id: string;
  session_id: string;
  student_id: string;
  concept: string;
  concept_key: string;
  result: "correct" | "partial" | "incorrect";
  independent: boolean;
  hints_used: number;
  rationale: string;
  citation?: { material_id: string; page: number; quote: string } | null;
  ts: Date | string;
}

export interface StoredConversations {
  sessions: StoredSession[];
  events: StoredEvent[];
  evidence: StoredEvidence[];
}

/** Reads stored conversations, oldest session first. Implemented by `MongoConversationReader` in @mento/db. */
export interface ConversationReader {
  read(filter: { session_id?: string; student_id?: string }): Promise<StoredConversations>;
}
