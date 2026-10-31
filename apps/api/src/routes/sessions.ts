import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CreateSessionRequest,
  CreateSessionResponse,
  EndSessionRequest,
  ErrorResponse,
  ListSessionsQuery,
  ListSessionsResponse,
  SessionDetailResponse,
} from "@mento/contracts";
import { getAnalysisData, startAnalysis } from "../controllers/teacher.controller";

// Whiteboard (Person 3): sessions are stored in MongoDB (sessions + events collections).
//   POST /api/sessions: from a subject (its books are the sources) or a free whiteboard (subject_id omitted or null).
//   GET /api/sessions, GET /api/sessions/:id: the history screen and re-opening a conversation. POST /sessions/:id/end.
// Teacher side (Person 1): the analysis of one conversation (POST|GET /sessions/:id/analysis).
const Params = z.object({ id: z.string() });

const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/sessions", { schema: { querystring: ListSessionsQuery, response: { 200: ListSessionsResponse, 503: ErrorResponse } } }, async (request) => {
    return { sessions: await request.server.container.history.listSessions(request.query) };
  });

  app.get(
    "/sessions/:id",
    { schema: { params: z.object({ id: z.string().min(1) }), response: { 200: SessionDetailResponse, 404: ErrorResponse, 503: ErrorResponse } } },
    async (request, reply) => {
      const { history, repo } = request.server.container;
      const session = await history.getSessionSummary(request.params.id);
      if (!session) return reply.status(404).send({ error: "session_not_found" });
      return { session, events: await repo.listEvents(session.id) };
    },
  );

  app.post(
    "/sessions",
    { schema: { body: CreateSessionRequest, response: { 201: CreateSessionResponse, 404: ErrorResponse, 503: ErrorResponse } } },
    async (request, reply) => {
      const { repo, engine, subjects, dbReady } = request.server.container;
      const { subject_id, ...rest } = request.body;
      let subject: { id: string; name: string; key: string } | null = null;
      if (subject_id) {
        if (!dbReady()) return reply.status(503).send({ error: "database_unavailable" });
        const found = await subjects.get(subject_id);
        if (!found) return reply.status(404).send({ error: "subject_not_found" });
        subject = { id: found.id, name: found.name, key: found.key };
      }
      const { id } = await repo.createSession({ ...rest, subject });
      engine?.prewarm(id).catch((err) => request.log.warn({ err }, "prompt cache pre-warm failed"));
      return reply.status(201).send({ id, subject_id: subject?.id ?? null });
    },
  );

  app.post(
    "/sessions/:id/end",
    { schema: { params: z.object({ id: z.string().min(1) }), body: EndSessionRequest } },
    async (request, reply) => {
      const { repo, engine, tts } = request.server.container;
      const { id } = request.params;
      if (!(await repo.getSession(id))) return reply.status(404).send({ error: "session_not_found" });
      await repo.endSession(id, request.body.reason);
      engine?.forget(id);
      tts?.cancelAll();
      return { ok: true };
    },
  );

  app.post(
    "/sessions/:id/analysis",
    { schema: { params: Params, querystring: z.object({ force: z.enum(["true", "false"]).optional() }) } },
    async (request, reply) => reply.code(202).send(await startAnalysis(app.container, request.params.id, request.query.force === "true")),
  );

  app.get("/sessions/:id/analysis", { schema: { params: Params } }, async (request) => getAnalysisData(app.container, request.params.id));
};

export default plugin;
