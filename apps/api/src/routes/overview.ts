import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { getOverviewData } from "../controllers/teacher.controller";

// Owner: Person 1. GET /overview: the metrics on top of the Students tab.
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/overview", async () => getOverviewData(app.container));
};

export default plugin;
