import mongoose from "mongoose";
import type { CatalogRecord, Citation, Event, EventType, ListSessionsQuery, SessionHistory, SessionSummary } from "@mento/contracts";
import { EventModel } from "./models/event.model";
import { EvidenceModel } from "./models/evidence.model";
import { SessionModel } from "./models/session.model";
import { MongoChunkStore } from "./mongo-chunk-store";

/** MongoDB is not connected: routes answer 503 instead of waiting for Mongoose's 10 s command buffer. */
export class DatabaseUnavailableError extends Error {
  constructor() {
    super("MongoDB is not connected");
    this.name = "DatabaseUnavailableError";
  }
}

const ensureConnected = () => {
  if (mongoose.connection.readyState !== 1) throw new DatabaseUnavailableError();
};

interface SessionSubject {
  id: string;
  name: string;
  key: string;
}

interface SessionLean {
  _id: unknown;
  student_id: string;
  modality: "text" | "voice";
  subject?: SessionSubject | null;
  title?: string | null;
  started_at: Date;
  last_activity_at: Date;
  ended_at?: Date | null;
  end_reason?: string | null;
  turn_count?: number;
}

const toSubject = (s: SessionSubject | null | undefined): SessionSubject | null => (s ? { id: s.id, name: s.name, key: s.key } : null);

const toSummary = (d: SessionLean): SessionSummary => ({
  id: String(d._id),
  student_id: d.student_id,
  modality: d.modality,
  subject: toSubject(d.subject),
  title: d.title ?? null,
  started_at: d.started_at.toISOString(),
  last_activity_at: d.last_activity_at.toISOString(),
  ended_at: d.ended_at ? d.ended_at.toISOString() : null,
  end_reason: d.end_reason ?? null,
  turn_count: d.turn_count ?? 0,
});

/**
 * The tutor's storage on MongoDB (collections `sessions`, `events`) plus the history read side.
 * Implements `TurnRepository` from @mento/tutor structurally (this package does not depend on the tutor).
 * Class context and the learner summary are defaults until Person 1's teacher data exists.
 */
export class MongoTurnRepository implements SessionHistory {
  constructor(private readonly chunks: Pick<MongoChunkStore, "listCatalog"> = new MongoChunkStore()) {}

  async createSession(input: { student_id: string; modality: "text" | "voice"; topic?: string; subject?: SessionSubject | null }): Promise<{ id: string }> {
    ensureConnected();
    const subject = input.subject ?? null;
    const doc = await SessionModel.create({
      student_id: input.student_id,
      modality: input.modality,
      subject,
      subject_id: subject?.id ?? null,
      topic: input.topic,
      title: input.topic ? input.topic.slice(0, 80) : null,
    });
    const id = String(doc._id);
    await this.appendEvent(id, {
      type: "session_started",
      payload: { student_id: input.student_id, modality: input.modality, topic: input.topic, subject_id: subject?.id ?? null },
    });
    return { id };
  }

  async getSession(session_id: string): Promise<{ id: string; student_id: string; modality: "text" | "voice"; subject: SessionSubject | null; ended_at: string | null } | null> {
    ensureConnected();
    if (!mongoose.isValidObjectId(session_id)) return null;
    const d = await SessionModel.findById(session_id).lean<SessionLean | null>();
    return d ? {
      id: String(d._id),
      student_id: d.student_id,
      modality: d.modality,
      subject: toSubject(d.subject),
      ended_at: d.ended_at ? d.ended_at.toISOString() : null,
    } : null;
  }

  async appendEvent(session_id: string, event: { type: EventType; payload: unknown }): Promise<Event> {
    ensureConnected();
    const now = new Date();
    // JSON round trip: drop `undefined` fields (the driver would store them as null).
    const payload = event.payload === undefined ? null : (JSON.parse(JSON.stringify(event.payload)) as unknown);
    const doc = await EventModel.create({ session_id, ts: now, type: event.type, payload });

    const set: Record<string, unknown> = { last_activity_at: now };
    if (event.type === "session_ended") {
      set.ended_at = now;
      set.end_reason = (payload as { reason?: string } | null)?.reason ?? null;
    }
    if (event.type === "session_resumed") {
      set.ended_at = null;
      set.end_reason = null;
    }
    await SessionModel.updateOne({ _id: session_id }, { $set: set, ...(event.type === "turn_timing" ? { $inc: { turn_count: 1 } } : {}) });
    if (event.type === "user_message") {
      const text = (payload as { text?: unknown } | null)?.text;
      if (typeof text === "string") await SessionModel.updateOne({ _id: session_id, title: null }, { $set: { title: text.slice(0, 80) } });
    }
    return { id: String(doc._id), session_id, ts: now.toISOString(), type: event.type, payload };
  }

  async listEvents(session_id: string): Promise<Event[]> {
    ensureConnected();
    const docs = await EventModel.find({ session_id }).sort({ _id: 1 }).lean<{ _id: unknown; session_id: string; ts: Date; type: EventType; payload: unknown }[]>();
    return docs.map((d) => ({ id: String(d._id), session_id: d.session_id, ts: d.ts.toISOString(), type: d.type, payload: d.payload }));
  }

  async finishSession(session_id: string, reason: string): Promise<"finished" | "already_finished" | "not_found"> {
    ensureConnected();
    if (!mongoose.isValidObjectId(session_id)) return "not_found";

    const now = new Date();
    const previous = await SessionModel.findOneAndUpdate(
      { _id: session_id, ended_at: null },
      { $set: { ended_at: now, end_reason: reason, last_activity_at: now } },
      { returnDocument: "before" },
    ).lean<SessionLean | null>();
    if (!previous) return (await SessionModel.exists({ _id: session_id })) ? "already_finished" : "not_found";

    await EventModel.create({ session_id, ts: now, type: "session_ended", payload: { reason } });
    return "finished";
  }

  async resumeSession(session_id: string): Promise<"resumed" | "already_active" | "not_found"> {
    ensureConnected();
    if (!mongoose.isValidObjectId(session_id)) return "not_found";

    const now = new Date();
    const previous = await SessionModel.findOneAndUpdate(
      { _id: session_id, ended_at: { $ne: null } },
      { $set: { ended_at: null, end_reason: null, last_activity_at: now } },
      { returnDocument: "before" },
    ).lean<SessionLean | null>();
    if (!previous) return (await SessionModel.exists({ _id: session_id })) ? "already_active" : "not_found";

    const previous_ended_at = previous.ended_at?.toISOString();
    if (!previous_ended_at) throw new Error(`session ${session_id} resumed without an ended_at timestamp`);
    await EventModel.create({ session_id, ts: now, type: "session_resumed", payload: { previous_ended_at } });
    return "resumed";
  }

  async endSession(session_id: string, reason: string): Promise<void> {
    await this.finishSession(session_id, reason);
  }

  async getClassContext(): Promise<{ grade_level: string; description: string }> {
    return { grade_level: "8º ano", description: "" };
  }

  async getLearnerSummary(): Promise<{ open_gaps: { concept: string; concept_key: string; description: string; confidence: number }[]; recent_progress: { concept: string; description: string }[] }> {
    return { open_gaps: [], recent_progress: [] };
  }

  async getCatalog(subject_id?: string): Promise<CatalogRecord[]> {
    ensureConnected();
    return this.chunks.listCatalog(subject_id);
  }

  async listSessions(query: ListSessionsQuery): Promise<SessionSummary[]> {
    ensureConnected();
    const filter: Record<string, string> = {};
    if (query.student_id) filter.student_id = query.student_id;
    if (query.subject_id) filter.subject_id = query.subject_id;
    const docs = await SessionModel.find(filter).sort({ last_activity_at: -1 }).limit(query.limit).lean<SessionLean[]>();
    return docs.map(toSummary);
  }

  async getSessionSummary(session_id: string): Promise<SessionSummary | null> {
    ensureConnected();
    if (!mongoose.isValidObjectId(session_id)) return null;
    const d = await SessionModel.findById(session_id).lean<SessionLean | null>();
    return d ? toSummary(d) : null;
  }
}

/** Evidence rows on MongoDB (collection `evidence`). Implements `EvidenceStore` from @mento/tutor structurally. */
export class MongoEvidenceStore {
  async insertEvidence(e: {
    session_id: string;
    student_id: string;
    concept: string;
    concept_key: string;
    result: "correct" | "partial" | "incorrect";
    independent: boolean;
    hints_used: number;
    rationale: string;
    citation?: Citation;
  }): Promise<{ id: string }> {
    ensureConnected();
    const doc = await EvidenceModel.create({ ...e, citation: e.citation ?? null });
    return { id: String(doc._id) };
  }
}
