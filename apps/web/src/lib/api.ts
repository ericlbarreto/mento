// Typed client for the Fastify API (docs/16 §11). Every response is parsed with the protocol schemas.
// Mock mode: set NEXT_PUBLIC_MOCK_API=1 in the root .env to run the whiteboard without the API;
// list/create calls then return MOCK_* data and turns replay the fixtures in packages/board/fixtures.
import { PingResponse } from "@mento/contracts";
import {
  CreateSessionRequest,
  CreateSessionResponse,
  EndSessionRequest,
  MOCK_MATERIALS,
  MOCK_STUDENTS,
  MaterialSummary,
  type SessionEndReason,
  StreamMessage,
  StudentSummary,
  TurnRequest,
  pickFixture,
  replayFixture,
} from "@mento/board";
import { z } from "zod";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const MOCK_API = process.env.NEXT_PUBLIC_MOCK_API === "1";

export async function apiGet<T>(path: string, parse: (data: unknown) => T): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
  return parse(await res.json());
}

async function apiPost<T>(path: string, body: unknown, parse: (data: unknown) => T): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
  return parse(await res.json());
}

export const ping = () => apiGet("/ping", (d) => PingResponse.parse(d));

// ---- Start screen and session lifecycle ----

const MOCK_LATENCY_MS = 300;

export async function listStudents(): Promise<StudentSummary[]> {
  if (MOCK_API) {
    await delay(MOCK_LATENCY_MS);
    return MOCK_STUDENTS;
  }
  return apiGet("/students", (d) => z.array(StudentSummary).parse(d));
}

export async function listMaterials(opts: { ready_only?: boolean } = {}): Promise<MaterialSummary[]> {
  if (MOCK_API) {
    await delay(MOCK_LATENCY_MS);
    return opts.ready_only ? MOCK_MATERIALS.filter((m) => m.status === "ready") : MOCK_MATERIALS;
  }
  const query = opts.ready_only ? "?ready_only=true" : "";
  return apiGet(`/materials${query}`, (d) => z.array(MaterialSummary).parse(d));
}

/** Mock session id → number of turns already replayed (picks the next fixture). */
const mockTurnCounts = new Map<string, number>();

export async function createSession(req: CreateSessionRequest): Promise<CreateSessionResponse> {
  const body = CreateSessionRequest.parse(req);
  if (MOCK_API) {
    await delay(MOCK_LATENCY_MS);
    const id = mockObjectId();
    mockTurnCounts.set(id, 0);
    return { id };
  }
  return apiPost("/sessions", body, (d) => CreateSessionResponse.parse(d));
}

/** Ends a conversation. `beacon: true` uses navigator.sendBeacon (tab close; fire-and-forget). */
export async function endSession(
  session_id: string,
  reason: SessionEndReason,
  opts: { beacon?: boolean } = {},
): Promise<void> {
  const body = EndSessionRequest.parse({ reason });
  if (MOCK_API) {
    mockTurnCounts.delete(session_id);
    return;
  }
  const url = `${API_URL}/api/sessions/${encodeURIComponent(session_id)}/end`;
  if (opts.beacon) {
    navigator.sendBeacon(url, new Blob([JSON.stringify(body)], { type: "application/json" }));
    return;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status} on /sessions/${session_id}/end`);
}

// ---- Turns ----

/**
 * Streams one tutor turn (`event: <type>` / `data: <StreamMessage>`); every message is validated with StreamMessage.
 * Abort (both modes): when `signal` aborts, the generator stops yielding and returns cleanly; it never
 * throws an AbortError. Other failures (HTTP status, invalid message) throw.
 */
export async function* streamTurn(
  session_id: string,
  req: TurnRequest,
  opts: { signal?: AbortSignal } = {},
): AsyncGenerator<StreamMessage> {
  const body = TurnRequest.parse(req);
  const { signal } = opts;
  if (MOCK_API) {
    yield* mockTurn(session_id, body, signal);
    return;
  }
  try {
    const res = await fetch(`${API_URL}/api/sessions/${encodeURIComponent(session_id)}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`API ${res.status} on /sessions/${session_id}/turn`);
    for await (const { data } of readSse(res)) {
      if (signal?.aborted) return;
      yield StreamMessage.parse(data);
    }
  } catch (err) {
    if (signal?.aborted) return;
    throw err;
  }
}

/** Replays the fixture `pickFixture` chooses for this session's turn (timing: each message's `at_ms`). */
async function* mockTurn(session_id: string, req: TurnRequest, signal?: AbortSignal): AsyncGenerator<StreamMessage> {
  const turnIndex = mockTurnCounts.get(session_id) ?? 0;
  mockTurnCounts.set(session_id, turnIndex + 1);
  yield* replayFixture(pickFixture(req, turnIndex), { signal });
}

/** Resolves true after `ms`, or false as soon as `signal` aborts. */
function delay(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function mockObjectId(): string {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

/**
 * Minimal SSE reader over fetch (POST-capable, unlike EventSource).
 * TODO (Person 2): reconnect and the action queue.
 */
export async function* readSse(res: Response): AsyncGenerator<{ event: string; data: unknown }> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (data) yield { event, data: JSON.parse(data) };
    }
  }
}
