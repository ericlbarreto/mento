import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { WordTiming } from "@mento/contracts";

export interface TtsCacheEntry {
  audio: Buffer;
  words: WordTiming[];
}

/** Disk cache of synthesized speech, keyed by hash(text, voice, model). Purgeable at any time. */
export class TtsCache {
  constructor(private readonly dir: string) {}

  key(parts: { text: string; voiceId: string; modelId: string }): string {
    return createHash("sha256").update(JSON.stringify([parts.text, parts.voiceId, parts.modelId])).digest("hex").slice(0, 32);
  }

  async get(key: string): Promise<TtsCacheEntry | null> {
    try {
      const [audio, meta] = await Promise.all([readFile(join(this.dir, `${key}.pcm`)), readFile(join(this.dir, `${key}.json`), "utf8")]);
      return { audio, words: JSON.parse(meta) as WordTiming[] };
    } catch {
      return null;
    }
  }

  async put(key: string, audio: Buffer, words: WordTiming[]): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await Promise.all([writeFile(join(this.dir, `${key}.pcm`), audio), writeFile(join(this.dir, `${key}.json`), JSON.stringify(words))]);
  }
}
