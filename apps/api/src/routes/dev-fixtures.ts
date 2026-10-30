import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

// Owner: Person 3. Endpoints (docs/21-repo-structure.md §5): GET /dev/fixture-turn?name= (replays a fixture in the real SSE format)
// TODO: implement. Keep the route thin: parse with Zod (@mento/contracts), call a package, respond.
const plugin: FastifyPluginAsyncZod = async (_app) => {};

export default plugin;
