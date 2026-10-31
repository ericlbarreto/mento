import { z } from "zod";
import { BoardCoord, Column, ElementId } from "./actions";
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

export const FinishSessionResponse = z.object({
  ok: z.literal(true),
  transition: z.enum(["finished", "already_finished"]),
});
export type FinishSessionResponse = z.infer<typeof FinishSessionResponse>;

export const ResumeSessionResponse = z.object({
  ok: z.literal(true),
  transition: z.enum(["resumed", "already_active"]),
});
export type ResumeSessionResponse = z.infer<typeof ResumeSessionResponse>;

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

/**
 * POST /api/sessions/:id/board — the student deletes or moves a board element (plan F, D79).
 * `edit_id` is a client uuid (dedupe). A move is absolute: the element goes to `column`, right after
 * `after_id` (null = top of the column), so a retry gives the same board. A place (plan G) pins the element at a free
 * spot of the canvas: `x`, `y` in board px at zoom 1 from the top-left of the board; a later move puts it back in a column.
 */
export const BoardEditRequest = z.discriminatedUnion("op", [
  z.object({ op: z.literal("remove"), edit_id: z.string().min(1).max(64), element_id: ElementId }),
  z.object({ op: z.literal("move"), edit_id: z.string().min(1).max(64), element_id: ElementId, column: Column, after_id: ElementId.nullable() }),
  z.object({ op: z.literal("place"), edit_id: z.string().min(1).max(64), element_id: ElementId, x: BoardCoord, y: BoardCoord }),
]);
export type BoardEditRequest = z.infer<typeof BoardEditRequest>;

/** Stored event type of each board edit op, and back (contracts-spec §18). */
export const BOARD_EDIT_EVENTS = {
  board_element_removed: "remove",
  board_element_moved: "move",
  board_element_placed: "place",
} as const satisfies Record<string, BoardEditRequest["op"]>;
export type BoardEditEventType = keyof typeof BOARD_EDIT_EVENTS;
export const isBoardEditEvent = (type: string): type is BoardEditEventType => Object.hasOwn(BOARD_EDIT_EVENTS, type);

/** The stored event of an applied edit: its type and payload (the request without `op`). */
export function boardEditEvent(edit: BoardEditRequest): { type: BoardEditEventType; payload: Record<string, unknown> } {
  const { op, ...payload } = edit;
  const type = (Object.keys(BOARD_EDIT_EVENTS) as BoardEditEventType[]).find((t) => BOARD_EDIT_EVENTS[t] === op)!;
  return { type, payload };
}

/** Parses a stored board edit event back into the request (null when malformed). */
export function boardEditOf(type: BoardEditEventType, payload: unknown): BoardEditRequest | null {
  const parsed = BoardEditRequest.safeParse({ ...(payload as object), op: BOARD_EDIT_EVENTS[type] });
  return parsed.success ? parsed.data : null;
}

export const BoardEditResponse = z.object({ ok: z.literal(true), result: z.enum(["applied", "already_applied", "already_removed"]) });
export type BoardEditResponse = z.infer<typeof BoardEditResponse>;
