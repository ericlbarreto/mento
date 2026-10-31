import { z } from "zod";
import { Event } from "./events";

export const CreateSessionRequest = z.object({
  student_id: z.string().min(1),
  modality: z.enum(["text", "voice"]),
  topic: z.string().max(120).optional(),
  /** The subject the student clicked. Omitted or null: a free whiteboard that searches all materials. */
  subject_id: z.string().min(1).nullable().optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const CreateSessionResponse = z.object({ id: z.string().min(1), subject_id: z.string().min(1).nullable() });
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>;

export const EndSessionRequest = z.object({ reason: z.enum(["user_left", "idle_timeout", "beacon", "manual"]) });
export type EndSessionRequest = z.infer<typeof EndSessionRequest>;

/** A conversation as the history list shows it. `subject` null = free whiteboard. */
export const SessionSummary = z.object({
  id: z.string().min(1),
  student_id: z.string().min(1),
  modality: z.enum(["text", "voice"]),
  subject: z.object({ id: z.string().min(1), name: z.string().min(1), key: z.string().min(1) }).nullable(),
  /** The student's first message (or the topic), cut to 80 characters; null until the student says something. */
  title: z.string().nullable(),
  started_at: z.iso.datetime(),
  last_activity_at: z.iso.datetime(),
  ended_at: z.iso.datetime().nullable(),
  end_reason: z.string().nullable(),
  /** Tutor turns completed. */
  turn_count: z.number().int().min(0),
});
export type SessionSummary = z.infer<typeof SessionSummary>;

export const ListSessionsQuery = z.object({
  student_id: z.string().min(1).optional(),
  subject_id: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListSessionsQuery = z.infer<typeof ListSessionsQuery>;

export const ListSessionsResponse = z.object({ sessions: z.array(SessionSummary) });
export type ListSessionsResponse = z.infer<typeof ListSessionsResponse>;

/** A session with every stored event, in order: enough to rebuild the board and the transcript. */
export const SessionDetailResponse = z.object({ session: SessionSummary, events: z.array(Event) });
export type SessionDetailResponse = z.infer<typeof SessionDetailResponse>;

/** Read side of stored conversations (history screen). Implemented by `MongoTurnRepository` in @mento/db. */
export interface SessionHistory {
  /** Newest first (by last activity). */
  listSessions(query: ListSessionsQuery): Promise<SessionSummary[]>;
  getSessionSummary(session_id: string): Promise<SessionSummary | null>;
}
