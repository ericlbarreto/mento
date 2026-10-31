import { describe, expect, it } from "vitest";
import { GeminiImageClient, extractImage } from "./gemini-image";

const png = Buffer.from([137, 80, 78, 71, 1, 2, 3, 4]);
const b64 = png.toString("base64");

describe("extractImage", () => {
  it("reads output_image.data", () => {
    const out = extractImage({ output_image: { data: b64, mime_type: "image/png" } });
    expect(out?.bytes.equals(png)).toBe(true);
    expect(out?.mime_type).toBe("image/png");
  });

  it("finds a nested part with inline data and an image mime type, in either casing", () => {
    expect(extractImage({ outputs: [{ type: "text", text: "ok" }, { inline_data: { data: b64, mime_type: "image/jpeg" } }] })?.mime_type).toBe("image/jpeg");
    expect(extractImage({ candidates: [{ content: { parts: [{ inlineData: { data: b64, mimeType: "image/webp" } }] } }] })?.mime_type).toBe("image/webp");
  });

  it("returns null when there is no image", () => {
    expect(extractImage({ outputs: [{ type: "text", text: "sorry" }] })).toBeNull();
    expect(extractImage(null)).toBeNull();
  });
});

describe("GeminiImageClient", () => {
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("posts the request with the API key header and returns the image", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return ok({ output_image: { data: b64, mime_type: "image/jpeg" } });
    }) as unknown as typeof fetch;
    const client = new GeminiImageClient({ apiKey: "g-key", model: "gemini-3.1-flash-lite-image", fetchImpl });
    const image = await client.generate({ prompt: "Coliseu" });
    expect(image.bytes.equals(png)).toBe(true);
    expect(seen?.url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect((seen?.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-key");
    expect(JSON.parse(String(seen?.init.body))).toEqual({
      model: "gemini-3.1-flash-lite-image",
      input: "Coliseu",
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "4:3", image_size: "1K" },
    });
  });

  it("explains HTTP errors without leaking the key, and reports the response shape when no image is found", async () => {
    const limited = (async () => ok({ error: { message: "Rate limit exceeded (limit: 0 requests per day on Free Tier)" } }, 429)) as unknown as typeof fetch;
    const c1 = new GeminiImageClient({ apiKey: "secret-key", model: "m", fetchImpl: limited });
    await expect(c1.generate({ prompt: "x" })).rejects.toThrow(/429.*Free Tier/);

    const noImage = (async () => ok({ outputs: [{ type: "text", text: "secret-key" }] })) as unknown as typeof fetch;
    const c2 = new GeminiImageClient({ apiKey: "secret-key", model: "m", fetchImpl: noImage });
    const err = await c2.generate({ prompt: "x" }).catch((e: Error) => e);
    expect((err as Error).message).toContain("no image in the response");
    expect((err as Error).message).not.toContain("secret-key");
  });
});
