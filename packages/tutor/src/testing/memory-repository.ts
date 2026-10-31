import type { Event, EventType, ListSessionsQuery, SessionHistory, SessionSummary } from "@mento/contracts";
import type { CatalogEntry, ClassContext, LearnerSummary, SessionSubject } from "../prompt-builder";
import type { FinishSessionTransition, ResumeSessionTransition, SessionInfo, TurnRepository } from "../repository";

export interface MemorySeed {
  classContext?: ClassContext;
  summary?: LearnerSummary;
  catalog?: CatalogEntry[];
}

/** In-memory `TurnRepository` for tests and for running the API before the MongoDB repository exists. */
export class InMemoryTurnRepository implements TurnRepository, SessionHistory {
  private readonly sessions = new Map<string, SessionInfo>();
  private readonly events = new Map<string, Event[]>();
  private readonly summaries = new Map<string, SessionSummary & { activity: number }>();
  private seq = 0;

  constructor(private readonly seed: MemorySeed = {}) {}

  private nextId(): string {
    return (++this.seq).toString(16).padStart(24, "0");
  }

  async createSession(input: { student_id: string; modality: "text" | "voice"; topic?: string; subject?: SessionSubject | null }): Promise<{ id: string }> {
    const id = this.nextId();
    const subject = input.subject ?? null;
    this.sessions.set(id, { id, student_id: input.student_id, modality: input.modality, subject, ended_at: null });
    this.events.set(id, []);
    const now = new Date().toISOString();
    this.summaries.set(id, {
      id, student_id: input.student_id, modality: input.modality, subject, title: input.topic ? input.topic.slice(0, 80) : null,
      started_at: now, last_activity_at: now, ended_at: null, end_reason: null, turn_count: 0, activity: ++this.seq,
    });
    await this.appendEvent(id, {
      type: "session_started",
      payload: { student_id: input.student_id, modality: input.modality, topic: input.topic, subject_id: subject?.id ?? null },
    });
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
    const summary = this.summaries.get(session_id);
    if (summary) {
      summary.last_activity_at = stored.ts;
      summary.activity = ++this.seq;
      const p = (event.payload ?? {}) as { text?: unknown; reason?: unknown; previous_ended_at?: unknown };
      if (event.type === "turn_timing") summary.turn_count += 1;
      if (event.type === "user_message" && summary.title === null && typeof p.text === "string") summary.title = p.text.slice(0, 80);
      if (event.type === "session_ended") {
        summary.ended_at = stored.ts;
        summary.end_reason = typeof p.reason === "string" ? p.reason : null;
        const session = this.sessions.get(session_id);
        if (session) session.ended_at = stored.ts;
      }
      if (event.type === "session_resumed") {
        summary.ended_at = null;
        summary.end_reason = null;
        const session = this.sessions.get(session_id);
        if (session) session.ended_at = null;
      }
    }
    return stored;
  }

  async listEvents(session_id: string): Promise<Event[]> {
    return [...(this.events.get(session_id) ?? [])];
  }

  async finishSession(session_id: string, reason: string): Promise<FinishSessionTransition> {
    const session = this.sessions.get(session_id);
    if (!session) return "not_found";
    if (session.ended_at) return "already_finished";

    session.ended_at = new Date().toISOString();
    await this.appendEvent(session_id, { type: "session_ended", payload: { reason } });
    return "finished";
  }

  async resumeSession(session_id: string): Promise<ResumeSessionTransition> {
    const session = this.sessions.get(session_id);
    if (!session) return "not_found";
    if (!session.ended_at) return "already_active";

    const previous_ended_at = session.ended_at;
    session.ended_at = null;
    await this.appendEvent(session_id, { type: "session_resumed", payload: { previous_ended_at } });
    return "resumed";
  }

  async endSession(session_id: string, reason: string): Promise<void> {
    await this.finishSession(session_id, reason);
  }

  async getClassContext(): Promise<ClassContext> {
    return this.seed.classContext ?? { grade_level: "8º ano", description: "" };
  }

  async getLearnerSummary(): Promise<LearnerSummary> {
    return this.seed.summary ?? { open_gaps: [], recent_progress: [] };
  }

  async getCatalog(subject_id?: string): Promise<CatalogEntry[]> {
    const catalog = this.seed.catalog ?? [];
    return subject_id ? catalog.filter((m) => m.subject_id === subject_id) : catalog;
  }

  async listSessions(query: ListSessionsQuery): Promise<SessionSummary[]> {
    return [...this.summaries.values()]
      .filter((s) => (!query.student_id || s.student_id === query.student_id) && (!query.subject_id || s.subject?.id === query.subject_id))
      .sort((a, b) => b.activity - a.activity)
      .slice(0, query.limit)
      .map(({ activity: _activity, ...rest }) => rest);
  }

  async getSessionSummary(session_id: string): Promise<SessionSummary | null> {
    const s = this.summaries.get(session_id);
    if (!s) return null;
    const { activity: _activity, ...rest } = s;
    return rest;
  }
}
