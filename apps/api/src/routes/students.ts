import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateStudentBody, Severity, Student } from "@mento/contracts";
import {
  createStudent,
  getStudentData,
  getStudentEvolution,
  getStudentInsightsData,
  getStudentRows,
  getStudentSessionList,
} from "../controllers/teacher.controller";

const Params = z.object({ id: z.string() });

// Owner: Person 1. Teacher side: student list, creation, detail, insights table, evolution, conversations.
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/students", async () => getStudentRows(app.container));

  app.post("/students", { schema: { body: CreateStudentBody, response: { 201: Student } } }, async (request, reply) =>
    reply.code(201).send(await createStudent(app.container, request.body)),
  );

  app.get("/students/:id", { schema: { params: Params } }, async (request) => getStudentData(app.container, request.params.id));

  app.get(
    "/students/:id/insights",
    { schema: { params: Params, querystring: z.object({ severity: Severity.optional(), status: z.string().optional() }) } },
    async (request) => getStudentInsightsData(app.container, request.params.id, request.query),
  );

  app.get("/students/:id/evolution", { schema: { params: Params } }, async (request) => getStudentEvolution(app.container, request.params.id));

  app.get("/students/:id/sessions", { schema: { params: Params } }, async (request) => getStudentSessionList(app.container, request.params.id));
};

export default plugin;
