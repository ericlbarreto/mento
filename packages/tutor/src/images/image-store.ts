import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GeneratedImage } from "./gemini-image";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Disk cache of generated images keyed by hash(prompt, style, model). Served by `GET /api/gen/:file`. */
export class ImageStore {
  constructor(readonly dir: string) {}

  key(parts: { prompt: string; style: string; model: string }): string {
    return createHash("sha256").update(JSON.stringify([parts.style, parts.prompt, parts.model])).digest("hex").slice(0, 32);
  }

  urlFor(key: string, mime_type: string): string {
    return `/api/gen/${key}.${EXT[mime_type] ?? "jpg"}`;
  }

  async get(key: string): Promise<GeneratedImage | null> {
    for (const [ext, mime_type] of Object.entries(MIME)) {
      try {
        return { bytes: await readFile(join(this.dir, `${key}.${ext}`)), mime_type };
      } catch {
        /* try the next extension */
      }
    }
    return null;
  }

  async put(key: string, image: GeneratedImage): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${key}.${EXT[image.mime_type] ?? "jpg"}`), image.bytes);
  }
}
