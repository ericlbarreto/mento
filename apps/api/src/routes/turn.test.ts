import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { StreamMessage, type TurnRequest } from "@mento/contracts";
import { InMemoryTurnRepository, ScriptedLlm, stopEvent, toolEvent } from "@mento/tutor/testing";
import { TurnEngine, noopDraw, noopJudge, emptyRetriever } from "@mento/tutor";
import { buildApp } from "../app";
import { loadConfig } from "../config";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const config = loadConfig({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv);

async function start() {
  const repo = new InMemoryTurnRepository();
  const llm = new ScriptedLlm([[toolEvent("speak", { text: "Olá! O que vamos estudar?" }), toolEvent("write_text", { id: "title", column: "main", html: "<h1>Vamos começar</h1>" }), stopEvent()]]);
  const engine = new TurnEngine({ llm, repo, retriever: emptyRetriever, tts: null, draw: noopDraw, judge: noopJudge, prompts: { base: "B", subjects: { generic: "G" } }, models: { tutor: "m" } });
  app = await buildApp(config, { repo, engine });
  await app.listen({ port: 0, host: "127.0.0.1" });
  return `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
}

function parseSse(text: string) {
  return text.split("\n\n").map((b) => b.trim()).filter((b) => b && !b.startsWith(":")).map((b) => ({
    event: /^event: (.*)$/m.exec(b)?.[1] ?? "message",
    data: JSON.parse(/^data: (.*)$/m.exec(b)?.[1] ?? "null") as unknown,
  }));
}

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("sessions and turns", () => {
  it("creates a session from a student only, runs a turn and every SSE message satisfies the contract", async () => {
    const base = await start();
    const created = await post(`${base}/api/sessions`, { student_id: "stu_1", modality: "text" });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const turn: TurnRequest = { modality: "text", appended: [] };
    const res = await post(`${base}/api/sessions/${id}/turn`, turn);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = parseSse(await res.text());
    for (const { event, data } of events) expect(event).toBe(StreamMessage.parse(data).type);
    expect(events.map((e) => e.event)).toEqual(["action", "action", "script_done", "turn_done"]);
  });

  it("answers 404 for an unknown session, 400 for a bad body, and ends a session", async () => {
    const base = await start();
    expect((await post(`${base}/api/sessions/nope/turn`, { modality: "text", appended: [] })).status).toBe(404);
    const { id } = (await (await post(`${base}/api/sessions`, { student_id: "s", modality: "text" })).json()) as { id: string };
    expect((await post(`${base}/api/sessions/${id}/turn`, { modality: "fax" })).status).toBe(400);
    expect((await post(`${base}/api/sessions/${id}/end`, { reason: "user_left" })).status).toBe(200);
    expect((await post(`${base}/api/sessions/nope/end`, { reason: "user_left" })).status).toBe(404);
  });

  it("answers 503 for a turn when no LLM is configured", async () => {
    const repo = new InMemoryTurnRepository();
    app = await buildApp(config, { repo, engine: null });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    const { id } = (await (await post(`${base}/api/sessions`, { student_id: "s", modality: "text" })).json()) as { id: string };
    expect((await post(`${base}/api/sessions/${id}/turn`, { modality: "text", appended: [] })).status).toBe(503);
  });
});
