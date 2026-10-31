import mongoose from "mongoose";
import type { ConversationReader, StoredConversations, StoredEvent, StoredEvidence, StoredSession } from "@mento/contracts";
import { EventModel } from "./models/event.model";
import { EvidenceModel } from "./models/evidence.model";
import { SessionModel } from "./models/session.model";

type Lean<T> = Omit<T, "id"> & { _id: unknown };

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Reads the conversations the tutor stored (`sessions`, `events`, `evidences`) for the teacher's analysis. Read-only. */
export class MongoConversationReader implements ConversationReader {
  async read(filter: { session_id?: string; student_id?: string }): Promise<StoredConversations> {
    // Fail fast like the whiteboard routes do, instead of waiting for Mongoose's 10 s command buffer.
    if (mongoose.connection.readyState !== 1) throw new Error("MongoDB is not connected");
    if (filter.session_id && !OBJECT_ID.test(filter.session_id)) return { sessions: [], events: [], evidence: [] };

    const query: Record<string, unknown> = {};
    if (filter.session_id) query._id = filter.session_id;
    if (filter.student_id) query.student_id = filter.student_id;
    const sessions = await SessionModel.find(query).sort({ started_at: 1, _id: 1 }).lean<Lean<StoredSession>[]>();
    if (sessions.length === 0) return { sessions: [], events: [], evidence: [] };

    const ids = sessions.map((s) => String(s._id));
    const [events, evidence] = await Promise.all([
      EventModel.find({ session_id: { $in: ids } }).sort({ _id: 1 }).lean<Lean<StoredEvent>[]>(),
      EvidenceModel.find({ session_id: { $in: ids } }).sort({ ts: 1, _id: 1 }).lean<Lean<StoredEvidence>[]>(),
    ]);
    return {
      sessions: sessions.map((s) => ({ ...s, id: String(s._id) })),
      events: events.map((e) => ({ ...e, id: String(e._id) })),
      evidence: evidence.map((e) => ({ ...e, id: String(e._id) })),
    };
  }
}
