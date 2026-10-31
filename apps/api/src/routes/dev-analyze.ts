import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { runAnalysis } from "../controllers/teacher.controller";

// Owner: Person 1. POST /dev/analyze/:sessionId: re-run the analysis now (forced) and return the result.
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.post("/dev/analyze/:sessionId", { schema: { params: z.object({ sessionId: z.string() }) } }, async (request) =>
    runAnalysis(app.container, request.params.sessionId),
  );
};

export default plugin;
