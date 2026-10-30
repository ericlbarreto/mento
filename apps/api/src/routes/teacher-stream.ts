import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

// Owner: Person 1. Endpoints (docs/21-repo-structure.md §5): GET /stream/teacher (SSE live feed: insight_created, session_started, session_ended, material_status)
// TODO: implement. Keep the route thin: parse with Zod (@mento/contracts), call a package, respond.
const plugin: FastifyPluginAsyncZod = async (_app) => {};

export default plugin;
