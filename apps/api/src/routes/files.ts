import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { notFound } from "../lib/errors";

// Owner: Person 1. GET /files/:id: the uploaded PDF of a material, with HTTP Range support so pdf.js can open it at a page.
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/files/:id", { schema: { params: z.object({ id: z.string() }) } }, async (request, reply) => {
    const { teacherRepo: repo, fileStore: store } = app.container;
    const material = await repo.getMaterial(request.params.id);
    if (!material?.file) throw notFound("file");
    const size = (await store.size(material.file.key)) ?? 0;
    if (size === 0) throw notFound("file");

    reply.header("Accept-Ranges", "bytes").header("Content-Type", material.file.mime).header("Content-Disposition", "inline");
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
    if (!range || (range[1] === "" && range[2] === "")) return reply.header("Content-Length", size).send(store.stream(material.file.key));

    const start = range[1] === "" ? Math.max(size - Number(range[2]), 0) : Number(range[1]);
    const end = range[1] === "" || range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
    if (start > end || start >= size) return reply.code(416).header("Content-Range", `bytes */${size}`).send();
    return reply
      .code(206)
      .header("Content-Range", `bytes ${start}-${end}/${size}`)
      .header("Content-Length", end - start + 1)
      .send(store.stream(material.file.key, { start, end }));
  });
};

export default plugin;
