import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  BoardEditRequest,
  BoardEditResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  EndSessionRequest,
  ErrorResponse,
  FinishSessionResponse,
  ListSessionsQuery,
  ListSessionsResponse,
  ResumeSessionResponse,
  SessionDetailResponse,
} from "@mento/contracts";
import { applyStudentEdit, restoreRuntime, studentEditEvent } from "@mento/tutor";
import { getAnalysisData, startAnalysis } from "../controllers/teacher.controller";

// Whiteboard (Person 3): sessions are stored in MongoDB (sessions + events collections).
//   POST /api/sessions: from a subject (its books are the sources) or a free whiteboard (subject_id omitted or null).
//   GET /api/sessions, GET /api/sessions/:id: the history screen and re-opening a conversation.
//   POST /api/sessions/:id/board: the student deletes or moves a board element (plan F, D79); ended sessions too.
//   POST /sessions/:id/finish and /resume: explicit, idempotent lifecycle transitions. `/end` is a compatibility alias.
// Teacher side (Person 1): a winning finish triggers analysis; POST|GET /sessions/:id/analysis run and read it.
const Params = z.object({ id: z.string() });

const plugin: FastifyPluginAsyncZod = async (app) => {
  const finishSession = async (id: string, reason: string, warn: (error: unknown, message: string) => void) => {
    const { repo, engine, tts, sessionEnded } = app.container;
    const transition = await repo.finishSession(id, reason);
    if (transition === "finished") {
      engine?.forget(id);
      tts?.cancelAll();
      // Teacher side: analyse the stored conversation in the background (never delays or fails the answer).
      sessionEnded.handle(id).catch((error) => warn(error, "post-session analysis failed"));
    }
    return transition;
  };

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
    "/sessions/:id/board",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: BoardEditRequest,
        response: { 200: BoardEditResponse, 404: ErrorResponse, 503: ErrorResponse },
      },
    },
    async (request, reply) => {
      const { repo, engine } = request.server.container;
      const { id } = request.params;
      if (!(await repo.getSession(id))) return reply.status(404).send({ error: "session_not_found" });
      let result;
      if (engine) {
        // Through the engine: the in-memory board of a running turn sees the edit, and events stay in order.
        result = await engine.applyStudentEdit(id, request.body);
      } else {
        result = applyStudentEdit(restoreRuntime(await repo.listEvents(id)), request.body);
        if (result === "applied") await repo.appendEvent(id, studentEditEvent(request.body));
      }
      if (result === "element_not_found") return reply.status(404).send({ error: "element_not_found" });
      return { ok: true as const, result };
    },
  );

  app.post(
    "/sessions/:id/finish",
    { schema: { params: z.object({ id: z.string().min(1) }), body: EndSessionRequest, response: { 200: FinishSessionResponse, 404: ErrorResponse } } },
    async (request, reply) => {
      const transition = await finishSession(request.params.id, request.body.reason, (error, message) => request.log.warn({ err: error }, message));
      if (transition === "not_found") return reply.status(404).send({ error: "session_not_found" });
      return { ok: true as const, transition };
    },
  );

  app.post(
    "/sessions/:id/end",
    { schema: { params: z.object({ id: z.string().min(1) }), body: EndSessionRequest } },
    async (request, reply) => {
      const transition = await finishSession(request.params.id, request.body.reason, (error, message) => request.log.warn({ err: error }, message));
      if (transition === "not_found") return reply.status(404).send({ error: "session_not_found" });
      return { ok: true };
    },
  );

  app.post(
    "/sessions/:id/resume",
    { schema: { params: z.object({ id: z.string().min(1) }), response: { 200: ResumeSessionResponse, 404: ErrorResponse } } },
    async (request, reply) => {
      const { repo, engine } = request.server.container;
      const { id } = request.params;
      const transition = await repo.resumeSession(id);
      if (transition === "not_found") return reply.status(404).send({ error: "session_not_found" });
      if (transition === "resumed") {
        engine?.forget(id);
        engine?.prewarm(id).catch((error) => request.log.warn({ err: error }, "prompt cache pre-warm failed"));
      }
      return { ok: true as const, transition };
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
