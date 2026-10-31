import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { VoiceTokenResponse } from "@mento/contracts";
import { buildApp } from "../app";
import { loadConfig } from "../config";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("POST /api/voice/token", () => {
  it("answers 503 voice_unavailable when no Deepgram key is configured", async () => {
    app = await buildApp(loadConfig({ LOG_LEVEL: "silent", DEEPGRAM_API_KEY: "" } as NodeJS.ProcessEnv));
    const res = await app.inject({ method: "POST", url: "/api/voice/token" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: "voice_unavailable" });
  });

  it("returns a token response that satisfies the contract", async () => {
    app = await buildApp(loadConfig({ LOG_LEVEL: "silent", DEEPGRAM_API_KEY: "dg" } as NodeJS.ProcessEnv), {
      mintSttToken: async () => ({ token: "jwt-abc", expires_in: 30 }),
    });
    const res = await app.inject({ method: "POST", url: "/api/voice/token" });
    expect(res.statusCode).toBe(200);
    const body = VoiceTokenResponse.parse(res.json());
    expect(body.token).toBe("jwt-abc");
    expect(body.ws_url).toBe("wss://api.deepgram.com/v1/listen");
    expect(body.params).toMatchObject({ model: "nova-3", language: "pt-BR", interim_results: "true" });
  });
});
