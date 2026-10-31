import type { Event, EventType } from "@mento/contracts";
import type { CatalogEntry, ClassContext, LearnerSummary, SessionSubject } from "./prompt-builder";

export interface SessionInfo {
  id: string;
  student_id: string;
  modality: "text" | "voice";
  /** The subject the session was started from; null for a free whiteboard. */
  subject: SessionSubject | null;
  ended_at: string | null;
}

export type SessionLifecycleTransition = "finished" | "already_finished" | "resumed" | "already_active" | "not_found";
export type FinishSessionTransition = Extract<SessionLifecycleTransition, "finished" | "already_finished" | "not_found">;
export type ResumeSessionTransition = Extract<SessionLifecycleTransition, "resumed" | "already_active" | "not_found">;

/**
 * The slice of the Repository (contracts-spec §9) that the tutor needs. Person 1's MongoDB repository
 * implements it; `InMemoryTurnRepository` (testing) is used until then and in tests.
 */
export interface TurnRepository {
  createSession(input: { student_id: string; modality: "text" | "voice"; topic?: string; subject?: SessionSubject | null }): Promise<{ id: string }>;
  getSession(session_id: string): Promise<SessionInfo | null>;
  appendEvent(session_id: string, event: { type: EventType; payload: unknown }): Promise<Event>;
  listEvents(session_id: string): Promise<Event[]>;
  /** Changes an active session to ended and appends one `session_ended` event. */
  finishSession(session_id: string, reason: string): Promise<FinishSessionTransition>;
  /** Changes an ended session back to active and appends one `session_resumed` event. */
  resumeSession(session_id: string): Promise<ResumeSessionTransition>;
  /** Backwards-compatible repository alias. Prefer `finishSession`. */
  endSession(session_id: string, reason: string): Promise<void>;
  getClassContext(): Promise<ClassContext>;
  getLearnerSummary(student_id: string): Promise<LearnerSummary>;
  /** Ready materials; only those of `subject_id` when it is given. */
  getCatalog(subject_id?: string): Promise<CatalogEntry[]>;
}
