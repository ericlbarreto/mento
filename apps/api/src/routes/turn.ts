import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { TurnRequest } from "@mento/contracts";
import { openSse, sendStreamMessage } from "../plugins/sse";

// Owner: Person 3. POST /api/sessions/:id/turn streams the tutor's script (SSE of StreamMessage).
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/sessions/:id/turn",
    { schema: { params: z.object({ id: z.string().min(1) }), body: TurnRequest } },
    async (request, reply) => {
      const { repo, engine } = request.server.container;
      if (!engine) return reply.status(503).send({ error: "tutor_unavailable", message: "ANTHROPIC_API_KEY is not set" });
      const { id } = request.params;
      if (!(await repo.getSession(id))) return reply.status(404).send({ error: "session_not_found" });

      const sse = openSse(request, reply);
      try {
        await engine.run(id, request.body, (m) => sendStreamMessage(sse, m), sse.signal);
      } catch (err) {
        request.log.error({ err }, "turn failed");
        if (!sse.signal.aborted) {
          sendStreamMessage(sse, { type: "error", code: "internal_error", message: "O tutor teve um problema. Tente de novo.", recoverable: true });
        }
      } finally {
        sse.close();
      }
    },
  );
};

export default plugin;
