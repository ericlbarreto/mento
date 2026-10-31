// Typed client for the Fastify API (docs/frontend-integration.md). Every response is parsed with @mento/contracts.
// Modes (root .env):
// - default: everything from the API at NEXT_PUBLIC_API_URL (default http://localhost:4000).
// - NEXT_PUBLIC_MOCK_API=1: no server at all. Subjects and students are the mocks in @mento/board, sessions live in
//   memory, and turns replay the repo's fixtures/turns locally.
// - NEXT_PUBLIC_TURN_SOURCE=fixture: real sessions and history, but turns come from GET /api/dev/fixture-turn (no
//   LLM key needed). Fixture turns are not stored on the server.
import {
  BoardEditRequest,
  BoardEditResponse,
  boardEditEvent,
  isBoardEditEvent,
  CreateSessionRequest,
  CreateSessionResponse,
  EndSessionRequest,
  ErrorResponse,
  type Event,
  ListSessionsResponse,
  ListSubjectsResponse,
  PingResponse,
  SessionDetailResponse,
  type SessionEndReason,
  type SessionSummary,
  StreamMessage,
  type SubjectSummary,
  TurnRequest,
  VoiceTokenResponse,
} from "@mento/contracts";
import {
  DEMO_STUDENT_ID,
  FIXTURE_TURNS,
  type FixtureName,
  MOCK_STUDENTS,
  MOCK_SUBJECTS,
  StudentSummary,
  namespaceFixtureMessage,
  pickFixture,
  replayFixture,
} from "@mento/board";
import { z } from "zod";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const MOCK_API = process.env.NEXT_PUBLIC_MOCK_API === "1";
export const TURN_SOURCE_FIXTURE = process.env.NEXT_PUBLIC_TURN_SOURCE === "fixture";

/** An HTTP error from the API: `error` is the stable code (`tutor_unavailable`, `session_not_found`…). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly error: string,
    message?: string,
  ) {
    super(message ?? `API ${status} ${error}`);
    this.name = "ApiError";
  }
}

/** Absolute URL for a path the API hands out (`/api/gen/…`, `/api/tts/…`); absolute URLs are returned as is. */
export const apiUrl = (path: string) => new URL(path, API_URL).href;

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Not JSON (proxy page, empty body): keep the status only.
  }
  const parsed = ErrorResponse.safeParse(body);
  return parsed.success ? new ApiError(res.status, parsed.data.error, parsed.data.message) : new ApiError(res.status, `http_${res.status}`);
}

async function request<T>(path: string, init: RequestInit, parse: (data: unknown) => T): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, { cache: "no-store", ...init });
  if (!res.ok) throw await toApiError(res);
  return parse(await res.json());
}

const get = <T>(path: string, parse: (data: unknown) => T) => request(path, {}, parse);
const post = <T>(path: string, body: unknown, parse: (data: unknown) => T) =>
  request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }, parse);

const sessionPath = (id: string) => `/sessions/${encodeURIComponent(id)}`;

export const ping = () => get("/ping", (d) => PingResponse.parse(d));

// ---- Start screen ----

export async function listSubjects(): Promise<SubjectSummary[]> {
  if (MOCK_API) {
    await delay(MOCK_LATENCY_MS);
    return MOCK_SUBJECTS;
  }
  return get("/subjects", (d) => ListSubjectsResponse.parse(d).subjects);
}

/** Students for the picker, or null when the API has no students route yet (404): the caller falls back to mocks. */
export async function listStudents(): Promise<StudentSummary[] | null> {
  if (MOCK_API) {
    await delay(MOCK_LATENCY_MS);
    return MOCK_STUDENTS;
  }
  try {
    return await get("/students", (d) => z.array(StudentSummary).parse(d));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// ---- Sessions ----

export async function createSession(req: CreateSessionRequest): Promise<CreateSessionResponse> {
  const body = CreateSessionRequest.parse(req);
  if (MOCK_API) {
    await delay(MOCK_LATENCY_MS);
    return mock.create(body);
  }
  return post("/sessions", body, (d) => CreateSessionResponse.parse(d));
}

/** History, newest activity first. `limit` defaults to 100 (the API's maximum) so counts cover the whole list. */
export async function listSessions(query: { student_id?: string; subject_id?: string; limit?: number } = {}): Promise<SessionSummary[]> {
  const { student_id, subject_id, limit = 100 } = query;
  if (MOCK_API) {
    await delay(MOCK_LATENCY_MS);
    return mock.list({ student_id, subject_id, limit });
  }
  const params = new URLSearchParams({ limit: String(limit) });
  if (student_id) params.set("student_id", student_id);
  if (subject_id) params.set("subject_id", subject_id);
  return get(`/sessions?${params}`, (d) => ListSessionsResponse.parse(d).sessions);
}

/** A session with every stored event (rebuild it with replayEvents from @mento/board). */
export async function getSession(id: string): Promise<SessionDetailResponse> {
  if (MOCK_API) {
    await delay(MOCK_LATENCY_MS);
    return mock.detail(id);
  }
  return get(sessionPath(id), (d) => SessionDetailResponse.parse(d));
}

/**
 * Ends a conversation. `keepalive: true` is for tab close: the request outlives the page and is best effort
 * (never throws). A cross-origin sendBeacon with a JSON body may be refused, so this uses fetch keepalive.
 */
export async function endSession(id: string, reason: SessionEndReason, opts: { keepalive?: boolean } = {}): Promise<void> {
  const body = JSON.stringify(EndSessionRequest.parse({ reason }));
  if (MOCK_API) {
    mock.end(id, reason);
    return;
  }
  const url = `${API_URL}/api${sessionPath(id)}/end`;
  if (opts.keepalive) {
    await fetch(url, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body }).catch(() => undefined);
    return;
  }
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
  if (!res.ok) throw await toApiError(res);
}

// ---- Board edits (plan F, D79) ----

/**
 * The student deletes or moves a board element: POST /api/sessions/:id/board. Idempotent on `edit_id`; 404
 * `element_not_found` / `session_not_found` reject with ApiError. `keepalive: true` is for `pagehide` (a deletion
 * still held for undo): best effort, never throws, resolves null. With NEXT_PUBLIC_TURN_SOURCE=fixture the turns
 * are not stored on the server, so edits stay local (resolves "applied").
 */
export async function editBoard(id: string, edit: BoardEditRequest, opts: { keepalive?: boolean } = {}): Promise<BoardEditResponse | null> {
  const body = BoardEditRequest.parse(edit);
  if (MOCK_API) return mock.editBoard(id, body);
  if (TURN_SOURCE_FIXTURE) return { ok: true, result: "applied" };
  const url = `${API_URL}/api${sessionPath(id)}/board`;
  const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  if (opts.keepalive) {
    await fetch(url, { ...init, keepalive: true }).catch(() => undefined);
    return null;
  }
  const res = await fetch(url, init);
  if (!res.ok) throw await toApiError(res);
  return BoardEditResponse.parse(await res.json());
}

// ---- Turns ----

type OnMessage = (message: StreamMessage) => void;

/**
 * Streams one tutor turn, calling `onMessage` with each validated StreamMessage; resolves when the stream ends.
 * Errors before the stream (404, 503 `tutor_unavailable`, 400) reject with ApiError. When `signal` aborts it
 * resolves quietly (never an AbortError). With NEXT_PUBLIC_TURN_SOURCE=fixture the turn is a fixture replay.
 */
/** Reopens an ended session (idempotent: an active one answers "already_active"). */
export async function resumeSession(id: string): Promise<void> {
  if (MOCK_API) return;
  const res = await fetch(`${API_URL}/api${sessionPath(id)}/resume`, { method: "POST" });
  if (!res.ok) throw await toApiError(res);
}

export async function streamTurn(id: string, req: TurnRequest, onMessage: OnMessage, opts: { signal?: AbortSignal } = {}): Promise<void> {
  const body = TurnRequest.parse(req);
  const { signal } = opts;
  if (MOCK_API) return mock.turn(id, body, onMessage, signal);
  if (TURN_SOURCE_FIXTURE) {
    const { name, round } = pickFixture(nextFixtureIndex(id));
    return streamFixtureTurn(name, onMessage, { signal, round });
  }
  try {
    const send = () =>
      fetch(`${API_URL}/api${sessionPath(id)}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify(body),
        signal,
      });
    let res = await send();
    // Leaving the page ends the lesson; coming back continues it: resume the same session, then send again.
    if (res.status === 409) {
      const err = await toApiError(res);
      if (err.error !== "session_ended") throw err;
      await resumeSession(id);
      res = await send();
    }
    if (!res.ok) throw await toApiError(res);
    await readSse(res, (data) => onMessage(StreamMessage.parse(data)));
  } catch (err) {
    if (signal?.aborted) return;
    throw err;
  }
}

/**
 * Replays a recorded turn through the API (GET /api/dev/fixture-turn), same SSE format as a real turn.
 * `speed` multiplies the recorded delays (0 = instant). Fixtures reuse ids, so `round` > 0 renames them
 * (namespaceFixtureMessage) to keep repeated replays from colliding on the board.
 */
export async function streamFixtureTurn(
  name: FixtureName,
  onMessage: OnMessage,
  opts: { signal?: AbortSignal; speed?: number; round?: number } = {},
): Promise<void> {
  const { signal, speed = 1, round = 0 } = opts;
  try {
    const params = new URLSearchParams({ name, speed: String(speed) });
    const res = await fetch(`${API_URL}/api/dev/fixture-turn?${params}`, { headers: { accept: "text/event-stream" }, signal });
    if (!res.ok) throw await toApiError(res);
    await readSse(res, (data) => onMessage(namespaceFixtureMessage(StreamMessage.parse(data), round)));
  } catch (err) {
    if (signal?.aborted) return;
    throw err;
  }
}

/** Session id → turns already sent (picks the next fixture in fixture and mock modes). */
const fixtureTurnCounts = new Map<string, number>();
function nextFixtureIndex(id: string): number {
  const n = fixtureTurnCounts.get(id) ?? 0;
  fixtureTurnCounts.set(id, n + 1);
  return n;
}

// ---- Voice ----

/** Deepgram token for useStt (@mento/voice/client). 503 `voice_unavailable` without a key: fall back to text. */
export async function getVoiceToken(): Promise<VoiceTokenResponse> {
  if (MOCK_API) throw new ApiError(503, "voice_unavailable", "Voz indisponível no modo demonstração");
  return post("/voice/token", undefined, (d) => VoiceTokenResponse.parse(d));
}

// ---- SSE ----

/**
 * Minimal SSE reader over fetch (POST-capable, unlike EventSource): calls `onData` with each event's parsed
 * `data`. Comment lines (": keep-alive") and events without data are ignored; a block left without the final
 * blank line is still delivered when the stream closes.
 */
export async function readSse(res: Response, onData: (data: unknown) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  const deliver = (block: string) => {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(line.startsWith("data: ") ? 6 : 5))
      .join("\n");
    if (data) onData(JSON.parse(data));
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      deliver(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) deliver(buffer);
}

// ---- Mock mode (NEXT_PUBLIC_MOCK_API=1): sessions in memory, turns from local fixtures ----

const MOCK_LATENCY_MS = 300;

interface MockSession {
  summary: SessionSummary;
  events: Event[];
}

const mock = (() => {
  const sessions = new Map<string, MockSession>();
  let seq = 0;

  const find = (id: string) => {
    const s = sessions.get(id);
    if (!s) throw new ApiError(404, "session_not_found");
    return s;
  };
  const record = (s: MockSession, type: Event["type"], payload: unknown) => {
    const ts = new Date().toISOString();
    s.events.push({ id: `mock_ev_${++seq}`, session_id: s.summary.id, ts, type, payload });
    s.summary.last_activity_at = ts;
  };
  /** The turn id the fixture announces (script_done), renamed for its round. */
  const fixtureTurnId = (name: FixtureName, round: number) => {
    const done = FIXTURE_TURNS[name].messages.find((m) => m.message.type === "script_done")?.message;
    const renamed = done && namespaceFixtureMessage(done, round);
    return renamed?.type === "script_done" ? renamed.turn_id : `mock_turn_${round}`;
  };

  const api = {
    create(req: CreateSessionRequest, id = mockObjectId()): CreateSessionResponse {
      const subject = MOCK_SUBJECTS.find((x) => x.id === req.subject_id) ?? null;
      if (req.subject_id && !subject) throw new ApiError(404, "subject_not_found");
      const now = new Date().toISOString();
      const s: MockSession = {
        summary: {
          id,
          student_id: req.student_id,
          modality: req.modality,
          subject: subject && { id: subject.id, name: subject.name, key: subject.key },
          title: req.topic ? req.topic.slice(0, 80) : null,
          started_at: now,
          last_activity_at: now,
          ended_at: null,
          end_reason: null,
          turn_count: 0,
        },
        events: [],
      };
      sessions.set(id, s);
      record(s, "session_started", { student_id: req.student_id, modality: req.modality, subject_id: subject?.id ?? null, topic: req.topic });
      return { id, subject_id: subject?.id ?? null };
    },

    list(q: { student_id?: string; subject_id?: string; limit: number }): SessionSummary[] {
      return [...sessions.values()]
        .map((s) => s.summary)
        .filter((s) => (!q.student_id || s.student_id === q.student_id) && (!q.subject_id || s.subject?.id === q.subject_id))
        .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))
        .slice(0, q.limit)
        .map((s) => ({ ...s }));
    },

    detail(id: string): SessionDetailResponse {
      const s = find(id);
      return { session: { ...s.summary }, events: [...s.events] };
    },

    end(id: string, reason: SessionEndReason) {
      const s = sessions.get(id);
      if (!s || s.summary.ended_at) return;
      record(s, "session_ended", { reason });
      s.summary.ended_at = s.summary.last_activity_at;
      s.summary.end_reason = reason;
    },

    /** Same answers as the server (contracts-spec §18), and the edit is stored so reopen/replay shows it. */
    editBoard(id: string, edit: BoardEditRequest): BoardEditResponse {
      const s = find(id);
      const present = new Set<string>();
      const known = new Set<string>();
      const editIds = new Set<string>();
      for (const e of s.events) {
        const p = (e.payload ?? {}) as { name?: string; args?: { id?: unknown }; element_id?: string; edit_id?: string };
        if (e.type === "tutor_action" && typeof p.args?.id === "string") {
          if (p.name === "remove_element") present.delete(p.args.id);
          else if (p.name !== "update_element") {
            present.add(p.args.id);
            known.add(p.args.id);
          }
        } else if (isBoardEditEvent(e.type)) {
          if (p.edit_id) editIds.add(p.edit_id);
          if (e.type === "board_element_removed" && p.element_id) present.delete(p.element_id);
        }
      }
      if (editIds.has(edit.edit_id)) return { ok: true, result: "already_applied" };
      if (!known.has(edit.element_id)) throw new ApiError(404, "element_not_found");
      if (!present.has(edit.element_id)) return { ok: true, result: "already_removed" };
      const { type, payload } = boardEditEvent(edit);
      record(s, type, payload);
      return { ok: true, result: "applied" };
    },

    /** Replays the next fixture and stores the turn's events like the server does (for history and reopen). */
    async turn(id: string, req: TurnRequest, onMessage: OnMessage, signal?: AbortSignal): Promise<void> {
      // Memory is lost on a page reload: recreate the session so a reloaded mock lesson still plays.
      if (!sessions.has(id)) api.create({ student_id: DEMO_STUDENT_ID, modality: req.modality }, id);
      const s = find(id);
      for (const a of req.appended) {
        if (a.name === "user_message") {
          record(s, "user_message", { kind: a.kind, text: a.text, selected: a.selected });
          s.summary.title ??= a.text.slice(0, 80);
        } else record(s, "verification_answered", { verification_id: a.verification_id, element_id: a.element_id, answer: a.answer });
      }
      const { name, round } = pickFixture(nextFixtureIndex(id));
      const turn_id = fixtureTurnId(name, round);
      for await (const m of replayFixture(name, { signal, round })) {
        if (m.type === "action") {
          const { action } = m;
          record(s, "tutor_action", { turn_id, action_id: action.id, order: m.order, name: action.name, args: action.args });
          if (action.name === "ask_verification") {
            const v = action.args;
            record(s, "verification_asked", {
              verification_id: v.verification_id,
              element_id: v.id,
              concept: v.concept,
              concept_key: v.concept_key,
              question: v.question,
              kind: v.kind,
            });
          }
        } else if (m.type === "turn_done") s.summary.turn_count++;
        onMessage(m);
      }
    },
  };
  return api;
})();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockObjectId(): string {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}
