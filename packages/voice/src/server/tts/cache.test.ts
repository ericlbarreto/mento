import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TtsCache } from "./cache";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mento-tts-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("TtsCache", () => {
  it("returns null for a miss and the stored audio and words after put", async () => {
    const cache = new TtsCache(dir);
    const key = cache.key({ text: "Olá!", voiceId: "v", modelId: "m" });
    expect(await cache.get(key)).toBeNull();
    const audio = Buffer.from([9, 8, 7, 6]);
    const words = [{ word: "Olá!", start_ms: 0, end_ms: 300 }];
    await cache.put(key, audio, words);
    const hit = await cache.get(key);
    expect(hit?.audio.equals(audio)).toBe(true);
    expect(hit?.words).toEqual(words);
  });

  it("builds different keys for different text, voice or model and the same key for the same input", () => {
    const cache = new TtsCache(dir);
    const base = { text: "a", voiceId: "v", modelId: "m" };
    expect(cache.key(base)).toBe(cache.key({ ...base }));
    expect(cache.key(base)).not.toBe(cache.key({ ...base, text: "b" }));
    expect(cache.key(base)).not.toBe(cache.key({ ...base, voiceId: "w" }));
    expect(cache.key(base)).not.toBe(cache.key({ ...base, modelId: "n" }));
  });
});
