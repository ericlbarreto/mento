import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { VoiceTokenResponse } from "@mento/contracts";
import { DEEPGRAM_LISTEN_PARAMS, DEEPGRAM_LISTEN_URL, isVoiceConfigError } from "@mento/voice/server";
import { z } from "zod";

// Owner: Person 3. POST /api/voice/token: short-lived Deepgram token for the browser.
// (GET /api/tts/:action_id lives in routes/tts.ts.)
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/voice/token",
    { schema: { response: { 200: VoiceTokenResponse, 503: z.object({ error: z.literal("voice_unavailable"), message: z.string() }) } } },
    async (request, reply) => {
      const { config, mintSttToken } = request.server.container;
      try {
        const { token, expires_in } = await mintSttToken({ apiKey: config.DEEPGRAM_API_KEY });
        return { token, expires_in, ws_url: DEEPGRAM_LISTEN_URL, params: DEEPGRAM_LISTEN_PARAMS };
      } catch (err) {
        if (isVoiceConfigError(err)) return reply.status(503).send({ error: "voice_unavailable", message: err.message });
        throw err;
      }
    },
  );
};

export default plugin;
