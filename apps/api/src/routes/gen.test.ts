import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ImageStore } from "@mento/tutor";
import { buildApp } from "../app";
import { loadConfig } from "../config";

let app: FastifyInstance | undefined;
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mento-gen-"));
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  await rm(dir, { recursive: true, force: true });
});

const key = "0123456789abcdef0123456789abcdef";

describe("GET /api/gen/:file", () => {
  it("serves a cached image with its content type and long-lived caching", async () => {
    await writeFile(join(dir, `${key}.jpg`), Buffer.from([1, 2, 3]));
    app = await buildApp(loadConfig({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv), { images: new ImageStore(dir) });
    const res = await app.inject({ url: `/api/gen/${key}.jpg` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toContain("immutable");
    expect([...res.rawPayload]).toEqual([1, 2, 3]);
  });

  it("answers 404 for a missing image and 400 for names that are not a cache key", async () => {
    app = await buildApp(loadConfig({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv), { images: new ImageStore(dir) });
    expect((await app.inject({ url: `/api/gen/${key}.jpg` })).statusCode).toBe(404);
    expect((await app.inject({ url: "/api/gen/..%2F..%2F.env" })).statusCode).toBe(400);
    expect((await app.inject({ url: "/api/gen/notakey.jpg" })).statusCode).toBe(400);
  });
});
