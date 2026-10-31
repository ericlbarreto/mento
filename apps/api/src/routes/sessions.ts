import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateSessionRequest, CreateSessionResponse, EndSessionRequest } from "@mento/contracts";

// Owner: Person 1 (session persistence); the create/end endpoints below are the minimal ones the whiteboard needs.
// POST /api/sessions: the student picks nothing but themselves; the tutor searches all materials.
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/sessions",
    { schema: { body: CreateSessionRequest, response: { 201: CreateSessionResponse } } },
    async (request, reply) => {
      const { repo, engine } = request.server.container;
      const { id } = await repo.createSession(request.body);
      engine?.prewarm(id).catch((err) => request.log.warn({ err }, "prompt cache pre-warm failed"));
      return reply.status(201).send({ id, subject_id: request.body.subject_id ?? null });
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
};

export default plugin;
