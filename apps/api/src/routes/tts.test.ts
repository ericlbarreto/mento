import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { loadConfig } from "../config";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const config = loadConfig({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv);

describe("GET /api/tts/:action_id", () => {
  it("answers 503 when TTS is not configured", async () => {
    app = await buildApp(config, { tts: null });
    expect((await app.inject({ url: "/api/tts/act_1" })).statusCode).toBe(503);
  });

  it("answers 404 for an unknown action and streams PCM for a known one", async () => {
    const fake = {
      has: (id: string) => id === "act_1",
      async *stream() {
        yield Buffer.from([1, 2]);
        yield Buffer.from([3, 4]);
      },
    };
    app = await buildApp(config, { tts: fake as never });
    expect((await app.inject({ url: "/api/tts/nope" })).statusCode).toBe(404);
    const res = await app.inject({ url: "/api/tts/act_1" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-audio-format"]).toBe("pcm_s16le_24000");
    expect([...res.rawPayload]).toEqual([1, 2, 3, 4]);
  });
});
