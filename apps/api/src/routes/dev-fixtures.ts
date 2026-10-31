import { readFile } from "node:fs/promises";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { FixtureTurn } from "@mento/contracts";
import { openSse, sendStreamMessage } from "../plugins/sse";

const FIXTURES_DIR = new URL("../../../../fixtures/turns/", import.meta.url);

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

// GET /api/dev/fixture-turn?name=rome-intro&speed=1: replays a recorded turn in the real SSE format,
// so the front-end can be built before the LLM exists. `speed` scales the clock (0 = instant).
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/dev/fixture-turn",
    {
      schema: {
        querystring: z.object({
          name: z.string().regex(/^[a-z0-9-]+$/),
          speed: z.coerce.number().min(0).max(10).default(1),
        }),
      },
    },
    async (request, reply) => {
      const { name, speed } = request.query;
      let fixture: FixtureTurn;
      try {
        fixture = FixtureTurn.parse(JSON.parse(await readFile(new URL(`${name}.json`, FIXTURES_DIR), "utf8")));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return reply.status(404).send({ error: "fixture_not_found", name });
        throw err;
      }

      const sse = openSse(request, reply);
      let previous = 0;
      for (const { at_ms, message } of fixture.messages) {
        await sleep((at_ms - previous) * speed, sse.signal);
        if (sse.signal.aborted) break;
        previous = at_ms;
        sendStreamMessage(sse, message);
      }
      sse.close();
    },
  );
};

export default plugin;
