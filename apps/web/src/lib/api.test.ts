import { replayEvents } from "@mento/board";
import type { StreamMessage } from "@mento/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Api = typeof import("./api");

/** Loads a fresh copy of the client with these env vars (modes are read at module load). */
async function load(env: Record<string, string> = {}): Promise<Api> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
  vi.stubEnv("NEXT_PUBLIC_MOCK_API", "");
  vi.stubEnv("NEXT_PUBLIC_TURN_SOURCE", "");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("./api");
}

const enc = new TextEncoder();
/** An SSE response delivered in exactly these chunks. */
const sse = (chunks: string[], status = 200) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const chunk of chunks) c.enqueue(enc.encode(chunk));
        c.close();
      },
    }),
    { status, headers: { "content-type": "text/event-stream" } },
  );
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const frame = (m: StreamMessage) => `event: ${m.type}\ndata: ${JSON.stringify(m)}\n\n`;

const speak: StreamMessage = { type: "action", order: 0, action: { id: "act_1", name: "speak", args: { text: "Olá!" } } };
const done: StreamMessage = { type: "turn_done", turn_id: "turn_1" };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("readSse", () => {
  it("joins frames split across chunks, skips comments and handles CRLF and a last frame without blank line", async () => {
    const { readSse } = await load();
    const whole = `: keep-alive\n\n${frame(speak)}`;
    const res = sse([whole.slice(0, 20), whole.slice(20, 41), whole.slice(41), "event: turn_done\r\ndata: ", JSON.stringify(done)]);
    const seen: unknown[] = [];
    await readSse(res, (d) => seen.push(d));
    expect(seen).toEqual([speak, done]);
  });
});

describe("streamTurn (real API)", () => {
  it("posts the TurnRequest and delivers each message parsed with StreamMessage", async () => {
    const api = await load();
    fetchMock.mockResolvedValue(sse([frame(speak), frame(done)]));
    const seen: StreamMessage[] = [];
    await api.streamTurn("s1", { modality: "text", appended: [] }, (m) => seen.push(m));
    expect(seen).toEqual([speak, done]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://api.test/api/sessions/s1/turn");
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ modality: "text", appended: [] }) });
  });

  it("throws a typed ApiError when the response is not ok, before any stream", async () => {
    const api = await load();
    fetchMock.mockResolvedValue(json({ error: "tutor_unavailable", message: "no LLM key" }, 503));
    const onMessage = vi.fn();
    const err = await api.streamTurn("s1", { modality: "text", appended: [] }, onMessage).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(api.ApiError);
    expect(err).toMatchObject({ status: 503, error: "tutor_unavailable", message: "no LLM key" });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("an ended session is resumed once, then the turn is sent again", async () => {
    const api = await load();
    fetchMock
      .mockResolvedValueOnce(json({ error: "session_ended" }, 409))
      .mockResolvedValueOnce(json({ ok: true, transition: "resumed" }))
      .mockResolvedValueOnce(sse([frame(speak), frame(done)]));
    const seen: StreamMessage[] = [];
    await api.streamTurn("s1", { modality: "text", appended: [] }, (m) => seen.push(m));
    expect(seen).toEqual([speak, done]);
    expect(fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit).method} ${url as string}`)).toEqual([
      "POST http://api.test/api/sessions/s1/turn",
      "POST http://api.test/api/sessions/s1/resume",
      "POST http://api.test/api/sessions/s1/turn",
    ]);
  });

  it("another 409 is not retried", async () => {
    const api = await load();
    fetchMock.mockResolvedValue(json({ error: "turn_in_progress" }, 409));
    const err = await api.streamTurn("s1", { modality: "text", appended: [] }, vi.fn()).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409, error: "turn_in_progress" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a non-JSON error body still gives an ApiError with the status", async () => {
    const api = await load();
    fetchMock.mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(api.streamTurn("s1", { modality: "text", appended: [] }, () => {})).rejects.toMatchObject({ status: 502, error: "http_502" });
  });

  it("rejects a message that is not a StreamMessage", async () => {
    const api = await load();
    fetchMock.mockResolvedValue(sse(['data: {"type":"done"}\n\n']));
    await expect(api.streamTurn("s1", { modality: "text", appended: [] }, () => {})).rejects.toThrow();
  });

  it("resolves quietly when aborted", async () => {
    const api = await load();
    const ac = new AbortController();
    fetchMock.mockImplementation(() => {
      ac.abort();
      return Promise.reject(new DOMException("aborted", "AbortError"));
    });
    await expect(api.streamTurn("s1", { modality: "text", appended: [] }, () => {}, { signal: ac.signal })).resolves.toBeUndefined();
  });
});

describe("REST calls", () => {
  const summary = {
    id: "s1",
    student_id: "demo-ana",
    modality: "text",
    subject: null,
    title: null,
    started_at: "2026-10-30T22:10:00.000Z",
    last_activity_at: "2026-10-30T22:10:00.000Z",
    ended_at: null,
    end_reason: null,
    turn_count: 0,
  };

  it("listSubjects, createSession, listSessions (limit 100 by default), getSession, getVoiceToken", async () => {
    const api = await load();
    fetchMock
      .mockResolvedValueOnce(json({ subjects: [{ id: "h", name: "História", key: "history", material_count: 0, materials: [] }] }))
      .mockResolvedValueOnce(json({ id: "s1", subject_id: "h" }, 201))
      .mockResolvedValueOnce(json({ sessions: [summary] }))
      .mockResolvedValueOnce(json({ session: summary, events: [] }))
      .mockResolvedValueOnce(json({ token: "t", expires_in: 30, ws_url: "wss://x.test/v1/listen", params: { model: "nova-3" } }));

    expect((await api.listSubjects())[0]?.key).toBe("history");
    expect(await api.createSession({ student_id: "demo-ana", modality: "text", subject_id: "h" })).toEqual({ id: "s1", subject_id: "h" });
    expect(await api.listSessions({ student_id: "demo-ana" })).toHaveLength(1);
    expect((await api.getSession("s1")).session.id).toBe("s1");
    expect((await api.getVoiceToken()).token).toBe("t");

    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      "http://api.test/api/subjects",
      "http://api.test/api/sessions",
      "http://api.test/api/sessions?limit=100&student_id=demo-ana",
      "http://api.test/api/sessions/s1",
      "http://api.test/api/voice/token",
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ student_id: "demo-ana", modality: "text", subject_id: "h" });
  });

  it("getSession 404 is an ApiError session_not_found", async () => {
    const api = await load();
    fetchMock.mockResolvedValue(json({ error: "session_not_found" }, 404));
    await expect(api.getSession("nope")).rejects.toMatchObject({ status: 404, error: "session_not_found" });
  });

  it("listStudents: 404 means the route is not available (null)", async () => {
    const api = await load();
    fetchMock.mockResolvedValueOnce(json({ error: "not_found" }, 404)).mockResolvedValueOnce(json([{ id: "x", name: "Ana S.", conversations: 2 }]));
    expect(await api.listStudents()).toBeNull();
    expect(await api.listStudents()).toEqual([{ id: "x", name: "Ana S." }]);
  });

  it("endSession: plain POST throws on error; keepalive uses fetch keepalive and never throws", async () => {
    const api = await load();
    fetchMock.mockResolvedValueOnce(json({ error: "session_not_found" }, 404)).mockRejectedValueOnce(new TypeError("offline"));
    await expect(api.endSession("s1", "manual")).rejects.toMatchObject({ status: 404 });
    await expect(api.endSession("s1", "beacon", { keepalive: true })).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("http://api.test/api/sessions/s1/end");
    expect(init).toEqual({ method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: '{"reason":"beacon"}' });
  });

  it("apiUrl resolves API paths and keeps absolute URLs", async () => {
    const api = await load();
    expect(api.apiUrl("/api/tts/act_2")).toBe("http://api.test/api/tts/act_2");
    expect(api.apiUrl("https://cdn.test/a.jpg")).toBe("https://cdn.test/a.jpg");
  });
});

describe("streamFixtureTurn and NEXT_PUBLIC_TURN_SOURCE=fixture", () => {
  it("replays through GET /api/dev/fixture-turn with name and speed", async () => {
    const api = await load();
    fetchMock.mockResolvedValue(sse([frame(speak), frame(done)]));
    const seen: StreamMessage[] = [];
    await api.streamFixtureTurn("rome-intro", (m) => seen.push(m), { speed: 0 });
    expect(fetchMock.mock.calls[0]![0]).toBe("http://api.test/api/dev/fixture-turn?name=rome-intro&speed=0");
    expect(seen).toEqual([speak, done]);
  });

  it("turns of a real session come from fixtures, alternating and renamed per round", async () => {
    const api = await load({ NEXT_PUBLIC_TURN_SOURCE: "fixture" });
    fetchMock.mockImplementation(() => Promise.resolve(sse([frame(done)])));
    const turnIds: string[] = [];
    const onMessage = (m: StreamMessage) => m.type === "turn_done" && turnIds.push(m.turn_id);
    for (let i = 0; i < 3; i++) await api.streamTurn("s1", { modality: "text", appended: [] }, onMessage);
    expect(fetchMock.mock.calls.map((c) => new URL(c[0]).searchParams.get("name"))).toEqual(["rome-intro", "click-and-ask", "rome-intro"]);
    expect(turnIds).toEqual(["turn_1", "turn_1", "turn_1_r1"]);
  });
});

describe("NEXT_PUBLIC_MOCK_API=1", () => {
  it("runs a whole lesson locally: subjects, session, fixture turn, history and reopen", async () => {
    vi.useFakeTimers();
    const api = await load({ NEXT_PUBLIC_MOCK_API: "1" });
    const subjectsP = api.listSubjects();
    await vi.advanceTimersByTimeAsync(1000);
    const [subject] = await subjectsP;
    expect(subject?.key).toBe("history");

    const createP = api.createSession({ student_id: "demo-ana", modality: "text", subject_id: subject!.id });
    await vi.advanceTimersByTimeAsync(1000);
    const { id } = await createP;

    const seen: string[] = [];
    const turn = api.streamTurn(id, { modality: "text", appended: [{ name: "user_message", kind: "chat", text: "Quem foi Augusto?" }] }, (m) => seen.push(m.type));
    await vi.advanceTimersByTimeAsync(5000);
    await turn;
    expect(seen.at(-1)).toBe("turn_done");
    expect(fetchMock).not.toHaveBeenCalled();

    const listP = api.listSessions({ student_id: "demo-ana" });
    const detailP = api.getSession(id);
    await vi.advanceTimersByTimeAsync(1000);
    const [list, detail] = await Promise.all([listP, detailP]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, title: "Quem foi Augusto?", turn_count: 1, subject: { key: "history" } });
    const replay = replayEvents(detail.events);
    expect(replay.tutorActionCount).toBe(7);
    expect(replay.lastTurnId).toBe("turn_1");
    expect(replay.transcript[0]).toMatchObject({ role: "student", text: "Quem foi Augusto?", via: "text" });

    await api.endSession(id, "manual");
    const endedP = api.listSessions();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await endedP)[0]).toMatchObject({ end_reason: "manual" });
    await expect(api.getVoiceToken()).rejects.toMatchObject({ status: 503, error: "voice_unavailable" });
  });
});
