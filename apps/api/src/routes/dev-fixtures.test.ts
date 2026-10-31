import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { StreamMessage } from "@mento/contracts";
import { buildApp } from "../app";
import { loadConfig } from "../config";

let app: FastifyInstance;
let base: string;

beforeEach(async () => {
  app = await buildApp(loadConfig({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv));
  await app.listen({ port: 0, host: "127.0.0.1" });
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
});
afterEach(async () => {
  await app.close();
});

/** Parse an SSE body into [event, data] pairs. */
function parseSse(text: string) {
  return text
    .split("\n\n")
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith(":"))
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? "message";
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? "";
      return { event, data: JSON.parse(data) as unknown };
    });
}

describe("GET /api/dev/fixture-turn", () => {
  it("streams a fixture where every message satisfies the StreamMessage contract", async () => {
    const res = await fetch(`${base}/api/dev/fixture-turn?name=rome-intro&speed=0`);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = parseSse(await res.text());
    expect(events.length).toBeGreaterThan(5);
    for (const { event, data } of events) {
      const parsed = StreamMessage.parse(data);
      expect(event).toBe(parsed.type);
    }
    expect(events.at(-1)?.event).toBe("turn_done");
    const types = events.map((e) => e.event);
    expect(types.indexOf("script_done")).toBeLessThan(types.indexOf("turn_done"));
  });

  it("answers 404 for an unknown fixture and 400 for an unsafe name", async () => {
    expect((await fetch(`${base}/api/dev/fixture-turn?name=nope`)).status).toBe(404);
    expect((await fetch(`${base}/api/dev/fixture-turn?name=../../package`)).status).toBe(400);
  });

  it("stops replaying when the client disconnects", async () => {
    const controller = new AbortController();
    const res = await fetch(`${base}/api/dev/fixture-turn?name=rome-intro&speed=1`, { signal: controller.signal });
    const reader = res.body!.getReader();
    await reader.read(); // first chunk arrives, then we leave
    controller.abort();
    await new Promise((r) => setTimeout(r, 100));
    await app.close(); // must not hang on a still-running replay
    expect(true).toBe(true);
  });
});
