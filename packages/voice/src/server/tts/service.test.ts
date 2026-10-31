import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TtsCache } from "./cache";
import { TtsService } from "./service";
import type { TtsChunk, TtsProvider, TtsRequest } from "./types";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mento-svc-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

class FakeProvider implements TtsProvider {
  calls: TtsRequest[] = [];
  aborted = false;
  constructor(private readonly chunks: TtsChunk[], private readonly delayMs = 0, private readonly failWith?: Error) {}
  async *synthesize(req: TtsRequest): AsyncGenerator<TtsChunk> {
    this.calls.push(req);
    req.signal?.addEventListener("abort", () => (this.aborted = true));
    for (const c of this.chunks) {
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
      if (req.signal?.aborted) return;
      if (this.failWith) throw this.failWith;
      yield c;
    }
  }
}

const chunk = (bytes: number[], text: string, base = 0): TtsChunk => ({
  audio: Buffer.from(bytes),
  chars: [...text].map((char, i) => ({ char, start_ms: base + i * 10, end_ms: base + i * 10 + 10 })),
});

const service = (provider: TtsProvider) => new TtsService({ provider, cache: new TtsCache(dir), voiceId: "v", modelId: "m" });

async function drain(gen: AsyncGenerator<Buffer>) {
  const parts: Buffer[] = [];
  for await (const b of gen) parts.push(b);
  return Buffer.concat(parts);
}

describe("TtsService", () => {
  it("streams chunks in order while synthesis is still running and reports words", async () => {
    const svc = service(new FakeProvider([chunk([1, 2], "Oi "), chunk([3, 4], "tu")], 5));
    const result = svc.start({ action_id: "act_1", text: "Oi tu" });
    expect(svc.has("act_1")).toBe(true);
    const audio = await drain(svc.stream("act_1"));
    expect([...audio]).toEqual([1, 2, 3, 4]);
    const r = await result;
    expect(r.words.map((w) => w.word)).toEqual(["Oi", "tu"]);
    expect(r.audio_bytes).toBe(4);
    expect(r.cached).toBe(false);
    expect(r.first_byte_ms).not.toBeNull();
  });

  it("serves the second identical request from the cache without calling the provider", async () => {
    const provider = new FakeProvider([chunk([5, 6, 7], "Olá")]);
    const svc = service(provider);
    await svc.start({ action_id: "a", text: "Olá" });
    const again = await svc.start({ action_id: "b", text: "Olá" });
    expect(again.cached).toBe(true);
    expect(provider.calls).toHaveLength(1);
    expect([...(await drain(svc.stream("b")))]).toEqual([5, 6, 7]);
  });

  it("cancels a running provider call and ends the stream", async () => {
    const provider = new FakeProvider([chunk([1], "a"), chunk([2], "b")], 30);
    const svc = service(provider);
    const result = svc.start({ action_id: "x", text: "ab" });
    await new Promise((r) => setTimeout(r, 10)); // the provider is running by now
    svc.cancel("x");
    await result.catch(() => undefined);
    expect(provider.aborted).toBe(true);
    expect((await drain(svc.stream("x"))).length).toBeLessThanOrEqual(1);
  });

  it("never calls the provider when cancelled before it starts", async () => {
    const provider = new FakeProvider([chunk([1], "a")]);
    const svc = service(provider);
    const result = svc.start({ action_id: "early", text: "a" });
    svc.cancel("early");
    expect((await result).audio_bytes).toBe(0);
    expect(provider.calls).toHaveLength(0);
  });

  it("propagates provider errors to start() and stream() without an unhandled rejection", async () => {
    const svc = service(new FakeProvider([chunk([1], "a")], 0, new Error("quota")));
    await expect(svc.start({ action_id: "e", text: "a" })).rejects.toThrow("quota");
    await expect(drain(svc.stream("e"))).rejects.toThrow("quota");
  });

  it("stops waiting when the caller's signal aborts", async () => {
    const svc = service(new FakeProvider([chunk([1], "a")], 200));
    svc.start({ action_id: "s", text: "a" }).catch(() => undefined);
    const controller = new AbortController();
    const reading = drain(svc.stream("s", controller.signal));
    controller.abort();
    expect((await reading).length).toBe(0);
    svc.cancelAll();
  });
});
