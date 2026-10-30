import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { PingResponse } from "@mento/contracts";
import { openSse } from "../plugins/sse";

// K1 wiring check: a Zod-validated route and a minimal SSE stream (replaced by real routes later).
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/ping", { schema: { response: { 200: PingResponse } } }, async () => ({
    ok: true as const,
    service: "mento-api",
    time: new Date().toISOString(),
  }));

  app.get("/ping/stream", async (request, reply) => {
    const sse = openSse(request, reply);
    for (let i = 1; i <= 3 && !sse.signal.aborted; i++) {
      sse.send("tick", { n: i });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    sse.send("done", {});
    sse.close();
  });
};

export default plugin;
