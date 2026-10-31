import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

// Owner: Person 3. Dev only: POST /api/dev/tts-start { action_id, text } starts a TTS job (the turn handler does this in production).
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/dev/tts-start",
    { schema: { body: z.object({ action_id: z.string().min(1), text: z.string().min(1).max(600) }) } },
    async (request, reply) => {
      const { tts } = request.server.container;
      if (!tts) return reply.status(503).send({ error: "tts_unavailable" });
      const { action_id, text } = request.body;
      tts.start({ action_id, text }).catch((err) => request.log.error({ err }, "dev tts failed"));
      return reply.status(202).send({ ok: true });
    },
  );
};

export default plugin;
