import type { Event, EventType } from "@mento/contracts";
import type { CatalogEntry, ClassContext, LearnerSummary } from "./prompt-builder";

export interface SessionInfo {
  id: string;
  student_id: string;
  modality: "text" | "voice";
}

/**
 * The slice of the Repository (contracts-spec §9) that the tutor needs. Person 1's MongoDB repository
 * implements it; `InMemoryTurnRepository` (testing) is used until then and in tests.
 */
export interface TurnRepository {
  createSession(input: { student_id: string; modality: "text" | "voice"; topic?: string }): Promise<{ id: string }>;
  getSession(session_id: string): Promise<SessionInfo | null>;
  appendEvent(session_id: string, event: { type: EventType; payload: unknown }): Promise<Event>;
  listEvents(session_id: string): Promise<Event[]>;
  /** Appends `session_ended` (which triggers the analysis). */
  endSession(session_id: string, reason: string): Promise<void>;
  getClassContext(): Promise<ClassContext>;
  getLearnerSummary(student_id: string): Promise<LearnerSummary>;
  getCatalog(): Promise<CatalogEntry[]>;
}
