import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

// Owner: Person 3. GET /api/tts/:action_id streams the PCM audio of one `speak` as it is synthesized.
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/tts/:action_id", { schema: { params: z.object({ action_id: z.string().min(1) }) } }, async (request, reply) => {
    const { tts } = request.server.container;
    if (!tts) return reply.status(503).send({ error: "tts_unavailable" });
    const { action_id } = request.params;
    if (!tts.has(action_id)) return reply.status(404).send({ error: "audio_not_found" });

    const controller = new AbortController();
    request.raw.on("close", () => controller.abort());
    reply.hijack();
    reply.raw.writeHead(200, {
      ...reply.getHeaders(),
      "Content-Type": "application/octet-stream",
      "X-Audio-Format": "pcm_s16le_24000",
      "Cache-Control": "no-store",
    } as Record<string, string>);
    try {
      for await (const chunk of tts.stream(action_id, controller.signal)) {
        if (controller.signal.aborted) break;
        reply.raw.write(chunk);
      }
    } catch (err) {
      request.log.error({ err }, "tts stream failed");
    } finally {
      reply.raw.end();
    }
  });
};

export default plugin;
