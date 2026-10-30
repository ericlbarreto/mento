import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { HealthResponse } from "@mento/contracts";
import { getHealth } from "../controllers/health.controller";

// GET /api/health: API + MongoDB status.
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/health", { schema: { response: { 200: HealthResponse } } }, getHealth);
};

export default plugin;
