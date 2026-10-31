import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { BoardEditResponse, SessionDetailResponse } from "@mento/contracts";
import { InMemoryTurnRepository, ScriptedLlm, stopEvent, toolEvent } from "@mento/tutor/testing";
import { TurnEngine, emptyRetriever, noopDraw, noopJudge } from "@mento/tutor";
import { buildApp } from "../app";
import { loadConfig } from "../config";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});
const config = loadConfig({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv);

const tutorAction = (id: string) => ({ type: "tutor_action" as const, payload: { turn_id: "turn_1", action_id: `act_${id}`, order: 0, name: "write_text", args: { id, column: "main", html: `<p>${id}</p>` } } });

async function start(withEngine: boolean) {
  const repo = new InMemoryTurnRepository();
  const llm = new ScriptedLlm([[toolEvent("write_text", { id: "titulo", column: "main", html: "<h1>Roma</h1>" }), toolEvent("write_text", { id: "nota", column: "main", html: "<p>Nota</p>" }), stopEvent()]]);
  const engine = withEngine ? new TurnEngine({ llm, repo, retriever: emptyRetriever, tts: null, draw: noopDraw, judge: noopJudge, prompts: { base: "B", subjects: { generic: "G" } }, models: { tutor: "m" } }) : null;
  app = await buildApp(config, { repo, history: repo, engine });
  const { id } = await repo.createSession({ student_id: "stu_1", modality: "text" });
  if (engine) {
    await engine.run(id, { modality: "text", appended: [] }, () => undefined, new AbortController().signal);
    await engine.idle();
  } else {
    await repo.appendEvent(id, tutorAction("titulo"));
    await repo.appendEvent(id, tutorAction("nota"));
  }
  const edit = (body: unknown, session = id) => app!.inject({ method: "POST", url: `/api/sessions/${session}/board`, payload: body as object });
  return { repo, id, edit };
}

describe.each([["with the engine", true], ["without an engine (repository fallback)", false]])("POST /api/sessions/:id/board %s", (_, withEngine) => {
  it("removes and moves elements, dedupes on edit_id, and the session detail shows the events", async () => {
    const { id, edit } = await start(withEngine);
    const removed = await edit({ op: "remove", edit_id: "e1", element_id: "titulo" });
    expect(removed.statusCode).toBe(200);
    expect(BoardEditResponse.parse(removed.json())).toEqual({ ok: true, result: "applied" });
    expect((await edit({ op: "remove", edit_id: "e1", element_id: "titulo" })).json()).toEqual({ ok: true, result: "already_applied" });
    expect((await edit({ op: "remove", edit_id: "e2", element_id: "titulo" })).json()).toEqual({ ok: true, result: "already_removed" });
    expect((await edit({ op: "move", edit_id: "e3", element_id: "nota", column: "side", after_id: null })).json()).toEqual({ ok: true, result: "applied" });

    const detail = SessionDetailResponse.parse((await app!.inject({ url: `/api/sessions/${id}` })).json());
    const edits = detail.events.filter((e) => e.type.startsWith("board_element"));
    expect(edits.map((e) => [e.type, e.payload])).toEqual([
      ["board_element_removed", { element_id: "titulo", edit_id: "e1" }],
      ["board_element_moved", { element_id: "nota", column: "side", after_id: null, edit_id: "e3" }],
    ]);
  });

  it("answers 404 session_not_found, 404 element_not_found and 400 for an invalid body", async () => {
    const { edit } = await start(withEngine);
    const noSession = await edit({ op: "remove", edit_id: "e1", element_id: "titulo" }, "nope");
    expect(noSession.statusCode).toBe(404);
    expect(noSession.json()).toMatchObject({ error: "session_not_found" });
    const noElement = await edit({ op: "remove", edit_id: "e1", element_id: "ghost" });
    expect(noElement.statusCode).toBe(404);
    expect(noElement.json()).toMatchObject({ error: "element_not_found" });
    expect((await edit({ op: "move", edit_id: "e2", element_id: "titulo" })).statusCode).toBe(400);
    expect((await edit({ op: "remove", edit_id: "", element_id: "titulo" })).statusCode).toBe(400);
  });

  it("works on an ended session", async () => {
    const { id, repo, edit } = await start(withEngine);
    await app!.inject({ method: "POST", url: `/api/sessions/${id}/finish`, payload: { reason: "user_left" } });
    expect((await repo.getSession(id))?.ended_at).not.toBeNull();
    expect((await edit({ op: "remove", edit_id: "e1", element_id: "nota" })).json()).toEqual({ ok: true, result: "applied" });
  });
});
