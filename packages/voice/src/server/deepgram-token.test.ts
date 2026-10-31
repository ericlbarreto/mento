import { describe, expect, it } from "vitest";
import { VoiceConfigError } from "./errors";
import { mintSttToken } from "./deepgram-token";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("mintSttToken", () => {
  it("posts to the grant endpoint with the Token scheme and returns the JWT", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return jsonResponse({ access_token: "jwt-123", expires_in: 30 });
    }) as unknown as typeof fetch;

    const out = await mintSttToken({ apiKey: "dg-key", fetchImpl });
    expect(out).toEqual({ token: "jwt-123", expires_in: 30 });
    expect(seen?.url).toBe("https://api.deepgram.com/v1/auth/grant");
    expect((seen?.init.headers as Record<string, string>).Authorization).toBe("Token dg-key");
    expect(JSON.parse(String(seen?.init.body))).toEqual({ ttl_seconds: 30 });
  });

  it("fails clearly without a key and on provider errors", async () => {
    await expect(mintSttToken({ apiKey: "" })).rejects.toBeInstanceOf(VoiceConfigError);
    const failing = (async () => jsonResponse({ err_msg: "no" }, 403)) as unknown as typeof fetch;
    await expect(mintSttToken({ apiKey: "k", fetchImpl: failing })).rejects.toThrow("403");
  });
});
