import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ListSessionsResponse, SessionDetailResponse } from "@mento/contracts";
import { InMemoryTurnRepository } from "@mento/tutor/testing";
import { buildApp } from "../app";
import { loadConfig } from "../config";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});
const config = loadConfig({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv);

describe("session history", () => {
  it("lists sessions newest first and returns one session with its events", async () => {
    const repo = new InMemoryTurnRepository();
    app = await buildApp(config, { repo, history: repo });
    const first = await repo.createSession({ student_id: "demo", modality: "text", subject: null });
    const second = await repo.createSession({ student_id: "demo", modality: "voice", subject: { id: "subj", name: "História", key: "history" } });
    await repo.appendEvent(second.id, { type: "user_message", payload: { kind: "chat", text: "Quem foram os irmãos Graco?" } });
    await repo.appendEvent(second.id, { type: "turn_timing", payload: { turn_id: "turn_1" } });

    const list = ListSessionsResponse.parse((await app.inject({ url: "/api/sessions?student_id=demo" })).json());
    expect(list.sessions.map((s) => s.id)).toEqual([second.id, first.id]);
    expect(list.sessions[0]).toMatchObject({ title: "Quem foram os irmãos Graco?", turn_count: 1, subject: { name: "História" } });

    const bySubject = ListSessionsResponse.parse((await app.inject({ url: "/api/sessions?subject_id=subj" })).json());
    expect(bySubject.sessions.map((s) => s.id)).toEqual([second.id]);

    const detail = SessionDetailResponse.parse((await app.inject({ url: `/api/sessions/${second.id}` })).json());
    expect(detail.session.id).toBe(second.id);
    expect(detail.events.map((e) => e.type)).toEqual(["session_started", "user_message", "turn_timing"]);
  });

  it("answers 404 for an unknown session and 400 for a bad limit", async () => {
    const repo = new InMemoryTurnRepository();
    app = await buildApp(config, { repo, history: repo });
    expect((await app.inject({ url: "/api/sessions/nope" })).statusCode).toBe(404);
    expect((await app.inject({ url: "/api/sessions?limit=1000" })).statusCode).toBe(400);
  });

  it("answers 503 database_unavailable when MongoDB is not connected (default repository)", async () => {
    app = await buildApp(config);
    const created = await app.inject({ method: "POST", url: "/api/sessions", payload: { student_id: "demo", modality: "text" } });
    expect(created.statusCode).toBe(503);
    expect(created.json()).toMatchObject({ error: "database_unavailable" });
    expect((await app.inject({ url: "/api/sessions" })).statusCode).toBe(503);
  });
});
