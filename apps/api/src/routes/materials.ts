import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Material } from "@mento/contracts";
import { getMaterial, listMaterials, uploadMaterial } from "../controllers/materials.controller";
import { badRequest } from "../lib/errors";

// Owner: Person 1. Materials: upload a PDF (multipart: title?, subject, file), list, status.
// The file is stored and ingested in the background; poll GET /materials/:id (or the teacher stream) for the status.
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/materials", { schema: { response: { 200: z.array(Material) } } }, async () => listMaterials(app.container));

  app.get("/materials/:id", { schema: { params: z.object({ id: z.string() }), response: { 200: Material } } }, async (request) =>
    getMaterial(app.container, request.params.id),
  );

  app.post("/materials", async (request, reply) => {
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
    const result = await uploadMaterial(app.container, { title: fields.title, subject: fields.subject, filename, data });
    return reply.code(result.duplicate ? 200 : 202).send(result);
  });
};

export default plugin;
