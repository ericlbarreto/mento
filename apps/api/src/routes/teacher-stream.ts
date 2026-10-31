import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { openSse } from "../plugins/sse";

// Owner: Person 1. GET /stream/teacher (SSE live feed): `analysis_status`, `insight_created`, `material_status`.
// The UI keeps a 5 s polling fallback.
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/stream/teacher", async (request, reply) => {
    const sse = openSse(request, reply);
    sse.send("hello", { ok: true });
    const unsubscribe = app.container.bus.subscribe((event) => sse.send(event.type, event));
    await new Promise<void>((resolve) => {
      sse.signal.addEventListener("abort", () => resolve());
    });
    unsubscribe();
    sse.close();
  });
};

export default plugin;
