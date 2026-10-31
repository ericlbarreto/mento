import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImageStore } from "./image-store";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mento-img-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("ImageStore", () => {
  it("misses, then stores and returns an image with its extension and URL", async () => {
    const store = new ImageStore(dir);
    const key = store.key({ prompt: "Coliseu", style: "lápis", model: "m" });
    expect(key).toMatch(/^[a-f0-9]{32}$/);
    expect(await store.get(key)).toBeNull();
    await store.put(key, { bytes: Buffer.from([1, 2, 3]), mime_type: "image/jpeg" });
    const hit = await store.get(key);
    expect(hit?.bytes.equals(Buffer.from([1, 2, 3]))).toBe(true);
    expect(hit?.mime_type).toBe("image/jpeg");
    expect(store.urlFor(key, "image/jpeg")).toBe(`/api/gen/${key}.jpg`);
    expect(store.urlFor(key, "image/png")).toBe(`/api/gen/${key}.png`);
  });

  it("builds different keys for different prompt, style or model", () => {
    const store = new ImageStore(dir);
    const a = { prompt: "a", style: "s", model: "m" };
    expect(store.key(a)).toBe(store.key({ ...a }));
    expect(store.key(a)).not.toBe(store.key({ ...a, prompt: "b" }));
    expect(store.key(a)).not.toBe(store.key({ ...a, style: "t" }));
    expect(store.key(a)).not.toBe(store.key({ ...a, model: "n" }));
  });
});
