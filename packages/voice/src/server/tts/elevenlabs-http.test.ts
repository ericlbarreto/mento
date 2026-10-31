import { describe, expect, it } from "vitest";
import { ElevenLabsHttpProvider } from "./elevenlabs-http";
import type { TtsChunk } from "./types";

const pcm = Buffer.from([1, 0, 2, 0, 3, 0]);

function provider(fetchImpl: typeof fetch) {
  return new ElevenLabsHttpProvider({ apiKey: "el-key", voiceId: "voice-1", modelId: "eleven_flash_v2_5", fetchImpl });
}

async function collect(gen: AsyncGenerator<TtsChunk>) {
  const out: TtsChunk[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

describe("ElevenLabsHttpProvider", () => {
  it("requests PCM 24 kHz with timestamps and decodes audio and alignment", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(
        JSON.stringify({
          audio_base64: pcm.toString("base64"),
          alignment: { characters: ["O", "i"], character_start_times_seconds: [0, 0.05], character_end_times_seconds: [0.05, 0.1] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const chunks = await collect(provider(fetchImpl).synthesize({ text: "Oi", previous_text: "Antes.", next_text: "Depois." }));

    expect(seen?.url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice-1/with-timestamps?output_format=pcm_24000");
    const headers = seen?.init.headers as Record<string, string>;
    expect(headers["xi-api-key"]).toBe("el-key");
    expect(JSON.parse(String(seen?.init.body))).toEqual({
      text: "Oi", model_id: "eleven_flash_v2_5", language_code: "pt", previous_text: "Antes.", next_text: "Depois.",
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.audio.equals(pcm)).toBe(true);
    expect(chunks[0]?.chars).toEqual([
      { char: "O", start_ms: 0, end_ms: 50 },
      { char: "i", start_ms: 50, end_ms: 100 },
    ]);
  });

  it("tolerates a response without alignment and throws on HTTP errors", async () => {
    const noAlignment = (async () => new Response(JSON.stringify({ audio_base64: pcm.toString("base64"), alignment: null }), { status: 200 })) as unknown as typeof fetch;
    expect((await collect(provider(noAlignment).synthesize({ text: "x" })))[0]?.chars).toEqual([]);

    const failing = (async () => new Response("quota", { status: 401 })) as unknown as typeof fetch;
    await expect(collect(provider(failing).synthesize({ text: "x" }))).rejects.toThrow("401");
  });
});
