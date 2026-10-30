import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

// Owner: Person 3. Endpoints (docs/21-repo-structure.md §5): POST /voice/token (ephemeral STT token), POST /tts (TTS proxy + word timings)
// TODO: implement. Keep the route thin: parse with Zod (@mento/contracts), call a package, respond.
const plugin: FastifyPluginAsyncZod = async (_app) => {};

export default plugin;
