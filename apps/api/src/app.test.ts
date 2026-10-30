import {  describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv);

describe("api wiring (K1)", () => {
  it("GET /api/health reports the mongo state without needing a database", async () => {
    const app = await buildApp(config);
    const res = await app.inject({ url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ service: "mento-api", mongo: "disconnected" });
    await app.close();
  });

  it("GET /api/ping is validated by the shared Zod schema", async () => {
    const app = await buildApp(config);
    const res = await app.inject({ url: "/api/ping" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, service: "mento-api" });
    await app.close();
  });

  it("GET /api/ping/stream sends SSE events", async () => {
    const app = await buildApp(config);
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${port}/api/ping/stream`);
    const text = await res.text();
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: tick");
    expect(text).toContain("event: done");
    await app.close();
  });
});
