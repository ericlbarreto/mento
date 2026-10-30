import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

// Owner: Person 1. Endpoints (docs/21-repo-structure.md §5): POST /dev/analyze/:sessionId (re-run the analysis)
// TODO: implement. Keep the route thin: parse with Zod (@mento/contracts), call a package, respond.
const plugin: FastifyPluginAsyncZod = async (_app) => {};

export default plugin;
