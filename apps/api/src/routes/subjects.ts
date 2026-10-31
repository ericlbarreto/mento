import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateSubjectRequest, ErrorResponse, ListSubjectsResponse, Subject, SubjectSummary } from "@mento/contracts";

const unavailable = { error: "database_unavailable" } as const;

// Owner: Person 3. Subjects (matérias) for the start screen: each one lists its ready materials.
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/subjects", { schema: { response: { 200: ListSubjectsResponse, 503: ErrorResponse } } }, async (request, reply) => {
    const { subjects, dbReady } = request.server.container;
    if (!dbReady()) return reply.status(503).send(unavailable);
    return { subjects: await subjects.list() };
  });

  app.get(
    "/subjects/:id",
    { schema: { params: z.object({ id: z.string().min(1) }), response: { 200: SubjectSummary, 404: ErrorResponse, 503: ErrorResponse } } },
    async (request, reply) => {
      const { subjects, dbReady } = request.server.container;
      if (!dbReady()) return reply.status(503).send(unavailable);
      const subject = await subjects.get(request.params.id);
      if (!subject) return reply.status(404).send({ error: "subject_not_found" });
      return subject;
    },
  );

  app.post("/subjects", { schema: { body: CreateSubjectRequest, response: { 201: Subject, 409: ErrorResponse, 503: ErrorResponse } } }, async (request, reply) => {
    const { subjects, dbReady } = request.server.container;
    if (!dbReady()) return reply.status(503).send(unavailable);
    try {
      return reply.status(201).send(await subjects.create(request.body));
    } catch (err) {
      // Checked by name: route files and @mento/db can be loaded by different module loaders in tests.
      if (err instanceof Error && err.name === "SubjectKeyTakenError") return reply.status(409).send({ error: "subject_key_taken" });
      throw err;
    }
  });
};

export default plugin;
