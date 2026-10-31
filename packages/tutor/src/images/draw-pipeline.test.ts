import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Action, StreamMessage } from "@mento/contracts";
import type { GeneratedImage, ImageClient } from "./gemini-image";
import { ImageStore } from "./image-store";
import { IMAGE_STYLE, ImageDrawPipeline, captionHtml, captionOnlyDraw } from "./draw-pipeline";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mento-draw-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

type DrawAction = Extract<Action, { name: "draw" }>;
const draw = (id = "colosseum", is_structured = false, prompt = "O Coliseu romano"): DrawAction => ({
  id: "act_1_0", name: "draw", args: { id, column: "visuals", prompt, is_structured, max_dimensions: { w: 500, h: 400 } },
});
const image: GeneratedImage = { bytes: Buffer.from([1, 2, 3]), mime_type: "image/jpeg" };

class FakeClient implements ImageClient {
  prompts: string[] = [];
  active = 0;
  maxActive = 0;
  constructor(private readonly delayMs = 0, private readonly fail = false) {}
  async generate(req: { prompt: string }): Promise<GeneratedImage> {
    this.prompts.push(req.prompt);
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    await new Promise((r) => setTimeout(r, this.delayMs));
    this.active--;
    if (this.fail) throw new Error("boom");
    return image;
  }
}

const pipeline = (client: ImageClient, opts: { timeoutMs?: number; maxConcurrent?: number } = {}) =>
  new ImageDrawPipeline({ client, store: new ImageStore(dir), model: "m", ...opts });
const ctx = (signal = new AbortController().signal) => ({ session_id: "s", signal });
const result = (m: StreamMessage[]) => m[0] as Extract<StreamMessage, { type: "action" }>;

describe("ImageDrawPipeline", () => {
  it("generates with the style prefix and returns a draw_result with the cached URL", async () => {
    const client = new FakeClient();
    const out = await pipeline(client).start(draw(), ctx());
    expect(client.prompts[0]).toBe(`O Coliseu romano. ${IMAGE_STYLE}`);
    expect(result(out).action).toMatchObject({ name: "draw_result", args: { element_id: "colosseum" } });
    expect((result(out).action.args as { url: string }).url).toMatch(/^\/api\/gen\/[a-f0-9]{32}\.jpg$/);
  });

  it("serves the second identical request from the cache without calling the client", async () => {
    const client = new FakeClient();
    const p = pipeline(client);
    await p.start(draw("a"), ctx());
    await p.start(draw("b"), ctx());
    expect(client.prompts).toHaveLength(1);
  });

  it("falls back to a caption card on failure, on timeout and for structured diagrams", async () => {
    for (const out of [
      await pipeline(new FakeClient(0, true)).start(draw(), ctx()),
      await pipeline(new FakeClient(200), { timeoutMs: 20 }).start(draw("slow", false, "outra imagem"), ctx()),
      await pipeline(new FakeClient()).start(draw("diagram", true), ctx()),
    ]) {
      expect(result(out).action).toMatchObject({ name: "update_element" });
    }
    expect((result(await captionOnlyDraw.start(draw("c", false, "A & B <x>"), ctx())).action.args as { html: string }).html).toBe(captionHtml("A & B <x>"));
    expect(captionHtml("A & B <x>")).toBe("<p><i>[ilustração: A &amp; B &lt;x&gt;]</i></p>");
  });

  it("limits concurrent generations", async () => {
    const client = new FakeClient(30);
    const p = pipeline(client, { maxConcurrent: 2 });
    await Promise.all([1, 2, 3, 4].map((n) => p.start(draw(`e${n}`, false, `imagem ${n}`), ctx())));
    expect(client.maxActive).toBe(2);
    expect(client.prompts).toHaveLength(4);
  });

  it("emits nothing when the client already left, but the image still lands in the cache", async () => {
    const client = new FakeClient(30);
    const p = pipeline(client);
    const controller = new AbortController();
    const started = p.start(draw("gone", false, "imagem abandonada"), ctx(controller.signal));
    controller.abort();
    expect(await started).toEqual([]);
    const again = await p.start(draw("gone2", false, "imagem abandonada"), ctx());
    expect(client.prompts).toHaveLength(1);
    expect(result(again).action).toMatchObject({ name: "draw_result" });
  });
});
