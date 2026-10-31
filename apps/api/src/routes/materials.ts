import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ErrorResponse, Material } from "@mento/contracts";
import { getMaterial, listMaterials, uploadMaterial } from "../controllers/materials.controller";
import { badRequest } from "../lib/errors";

// Owner: Person 1. Materials: upload a PDF of a subject (multipart: subject_id, title?, file), list, status.
// The file is stored and ingested in the background (text, chapters, embeddings into `chunks`, lesson sequence):
// poll GET /materials/:id (or the teacher stream); the material reaches the tutor and the subject when it is `ready`.
const UploadResponse = z.object({ id: z.string(), status: z.string(), duplicate: z.boolean() });

const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/materials", { schema: { response: { 200: z.array(Material) } } }, async () => listMaterials(app.container));

  app.get("/materials/:id", { schema: { params: z.object({ id: z.string() }), response: { 200: Material } } }, async (request) =>
    getMaterial(app.container, request.params.id),
  );

  app.post("/materials", { schema: { response: { 200: UploadResponse, 202: UploadResponse, 404: ErrorResponse, 503: ErrorResponse } } }, async (request, reply) => {
    const c = app.container;
    // Answer before reading a large file we could not process anyway.
    if (!c.dbReady()) return reply.status(503).send({ error: "database_unavailable" });
    if (!c.embed) return reply.status(503).send({ error: "embeddings_unavailable", message: "VOYAGE_API_KEY is not set" });

    const fields: Record<string, string> = {};
    let data: Buffer | null = null;
    let filename: string | undefined;
    for await (const part of request.parts()) {
      if (part.type === "file") {
        data = await part.toBuffer(); // throws 413 above UPLOAD_MAX_MB
        filename = part.filename;
      } else fields[part.fieldname] = String(part.value);
    }
    if (!data) throw badRequest("missing file");
    const result = await uploadMaterial(c, { title: fields.title, subject_id: fields.subject_id, filename, data });
    if (!result.ok) return reply.status(result.status).send({ error: result.error });
    return reply.code(result.duplicate ? 200 : 202).send({ id: result.id, status: result.status, duplicate: result.duplicate });
  });
};

export default plugin;
