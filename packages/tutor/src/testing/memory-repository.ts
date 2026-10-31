import type { Event, EventType } from "@mento/contracts";
import type { CatalogEntry, ClassContext, LearnerSummary } from "../prompt-builder";
import type { SessionInfo, TurnRepository } from "../repository";

export interface MemorySeed {
  classContext?: ClassContext;
  summary?: LearnerSummary;
  catalog?: CatalogEntry[];
}

/** In-memory `TurnRepository` for tests and for running the API before the MongoDB repository exists. */
export class InMemoryTurnRepository implements TurnRepository {
  private readonly sessions = new Map<string, SessionInfo>();
  private readonly events = new Map<string, Event[]>();
  private seq = 0;

  constructor(private readonly seed: MemorySeed = {}) {}

  private nextId(): string {
    return (++this.seq).toString(16).padStart(24, "0");
  }

  async createSession(input: { student_id: string; modality: "text" | "voice"; topic?: string }): Promise<{ id: string }> {
    const id = this.nextId();
    this.sessions.set(id, { id, student_id: input.student_id, modality: input.modality });
    this.events.set(id, []);
    await this.appendEvent(id, { type: "session_started", payload: { student_id: input.student_id, modality: input.modality, topic: input.topic } });
    return { id };
  }

  async getSession(session_id: string): Promise<SessionInfo | null> {
    return this.sessions.get(session_id) ?? null;
  }

  async appendEvent(session_id: string, event: { type: EventType; payload: unknown }): Promise<Event> {
    const list = this.events.get(session_id);
    if (!list) throw new Error(`unknown session ${session_id}`);
    const stored: Event = { id: this.nextId(), session_id, ts: new Date().toISOString(), type: event.type, payload: event.payload };
    list.push(stored);
    return stored;
  }

  async listEvents(session_id: string): Promise<Event[]> {
    return [...(this.events.get(session_id) ?? [])];
  }

  async endSession(session_id: string, reason: string): Promise<void> {
    await this.appendEvent(session_id, { type: "session_ended", payload: { reason } });
  }

  async getClassContext(): Promise<ClassContext> {
    return this.seed.classContext ?? { grade_level: "8º ano", description: "" };
  }

  async getLearnerSummary(): Promise<LearnerSummary> {
    return this.seed.summary ?? { open_gaps: [], recent_progress: [] };
  }

  async getCatalog(): Promise<CatalogEntry[]> {
    return this.seed.catalog ?? [];
  }
}
