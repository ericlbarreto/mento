import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Insight, Severity } from "@mento/contracts";
import { decideInsight, getClassInsights } from "../controllers/teacher.controller";

// Owner: Person 1. Class-wide insights section (critical / medium / positive) and the teacher's decision.
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/insights",
    { schema: { querystring: z.object({ severity: Severity.optional(), status: z.string().optional(), student_id: z.string().optional() }) } },
    async (request) => getClassInsights(app.container, request.query),
  );

  app.patch(
    "/insights/:id",
    { schema: { params: z.object({ id: z.string() }), body: z.object({ status: z.enum(["accepted", "dismissed"]) }), response: { 200: Insight } } },
    async (request) => decideInsight(app.container, request.params.id, request.body.status),
  );
};

export default plugin;
