# Whiteboard back-end, Plan 4: drawing (Gemini images) and the judge (evidence)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the tutor emits a `draw` action, an image is generated in the background (never blocking speech), cached, served by URL and swapped in with a late `draw_result`; when the student answers a verification question, a small fast model judges the answer in the background and records evidence for the teacher's analysis.

**Architecture:** Both features plug into the hooks defined in Plan 3 (`DrawPipeline`, `Judge`). `GeminiImageClient` talks to Google; `ImageStore` caches by hash on disk; `ImageDrawPipeline` adds the style prefix, a timeout, a concurrency limit and the fallback caption card. `ClaudeJudge` uses the existing `LlmClient` with the judge model and a forced `record_judgment` tool, computes `hints_used` from the event log, and writes evidence through an `EvidenceStore` (in memory now; Person 1's MongoDB repository later).

**Tech Stack:** TypeScript, Fastify 5, Vitest 5, Google Gemini API (REST), Anthropic Messages API (via `LlmClient`).

**Spec:** `docs/superpowers/specs/2026-10-30-whiteboard-backend-design.md` (§6 verification and judge, §7 drawing). Prerequisites: Plans 1 and 3.

## Global Constraints

- Drawing never blocks speech or any other action. Image timeout 12 s (`timeoutMs`), at most 2 concurrent image jobs, then a caption card replaces the placeholder.
- Fixed style prefix on every image prompt: "Colored-pencil sketch, white background, no text, no frame, soft hand-drawn lines, educational illustration for a middle school history class." Labels are separate `write_text` elements. No student data in prompts.
- Image cache key = sha256(style prefix, prompt, model); a job cancelled by an interruption still finishes into the cache but emits nothing.
- Image models: `gemini-3.1-flash-lite-image` (default, env `IMAGE_MODEL`) and `gemini-nano-banana-2.1` (comparison). Both $0.0336 per 1K image on Google's standard tier (2026-10-30). The REST response field names are **[verify day 0]**: the client extracts the image tolerantly and reports the response shape on failure.
- Structured SVG diagrams (`is_structured: true`) are not part of this plan (Should tier): they get the caption card for now.
- Judge model `claude-haiku-5-5` (env `JUDGE_MODEL`); it runs in the background and never blocks `turn_done`. `independent` = no hints were given for that question (`hints_used === 0`). Evidence follows `contracts-spec.md` §5 (`result` ∈ correct/partial/incorrect, `concept_key`, `rationale`, optional `citation`).
- Packages never read environment variables; `apps/api/src/config.ts` passes plain options.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/tutor/src/llm.ts`, `anthropic-llm.ts` | Add optional `tool_choice` (forced tool) |
| `packages/tutor/src/images/gemini-image.ts` | `GeminiImageClient` and tolerant response extraction |
| `packages/tutor/src/images/image-store.ts` | Disk cache and URL mapping |
| `packages/tutor/src/images/draw-pipeline.ts` | `ImageDrawPipeline`, `captionOnlyDraw` |
| `packages/tutor/src/judge/evidence.ts` | `EvidenceInput`, `EvidenceStore`, `InMemoryEvidenceStore` |
| `packages/tutor/src/judge/claude-judge.ts` | `ClaudeJudge` |
| `apps/api/src/routes/gen.ts` | `GET /api/gen/:file` serves generated images |
| `apps/api/src/config.ts`, `container.ts` | `GEMINI_API_KEY`, `IMAGE_MODEL`, wiring |
| `scripts/pregenerate-images.ts` | Seed the cache and compare models (Day-0 check 4) |
| `fixtures/images/rome.json` | The Rome prompts used for seeding and comparison |

---

### Task 1: Forced tool choice in the LLM interface

**Files:**
- Modify: `packages/tutor/src/llm.ts` (add `tool_choice` to `LlmRequest`)
- Modify: `packages/tutor/src/anthropic-llm.ts` (pass it through)
- Test: `packages/tutor/src/anthropic-llm.test.ts` (add a test)

**Interfaces:**
- Produces: `LlmRequest.tool_choice?: { type: "tool"; name: string }`; `AnthropicLlm.requestParams(req)` (exported helper used by the test).

- [ ] **Step 1: Write the failing test**

Append to `packages/tutor/src/anthropic-llm.test.ts`:

```ts
import { requestParams } from "./anthropic-llm";

describe("requestParams", () => {
  const base = { model: "m", system: [], tools: [], messages: [{ role: "user" as const, content: "x" }], max_tokens: 10 };

  it("omits tool_choice by default and forwards a forced tool", () => {
    expect("tool_choice" in requestParams(base)).toBe(false);
    expect(requestParams({ ...base, tool_choice: { type: "tool", name: "record_judgment" } }).tool_choice).toEqual({ type: "tool", name: "record_judgment" });
  });
});
```

(Keep the existing `toLlmError` test; add the `import { requestParams }` next to its existing import line.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mento/tutor test`
Expected: FAIL (`requestParams` is not exported).

- [ ] **Step 3: Implement**

In `packages/tutor/src/llm.ts`, add to `LlmRequest` (after `max_tokens`):

```ts
  /** Force the model to call one tool (used by the judge). Changing it invalidates the message cache only. */
  tool_choice?: { type: "tool"; name: string };
```

In `packages/tutor/src/anthropic-llm.ts`, add this exported function above the class and make the class use it (replace the private `params` method and its two call sites):

```ts
export function requestParams(req: Omit<LlmRequest, "signal">) {
  return {
    model: req.model,
    max_tokens: req.max_tokens,
    system: req.system,
    tools: req.tools,
    messages: req.messages,
    ...(req.tool_choice ? { tool_choice: req.tool_choice } : {}),
  };
}
```

and in the class replace `this.params(` with `requestParams(` in `stream` and `prewarm`, deleting the old `private params` method.

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm --filter @mento/tutor test && pnpm --filter @mento/tutor typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tutor
git commit -m "feat(whiteboard): forced tool choice in the LLM interface"
```

---

### Task 2: Gemini image client and the image store

**Files:**
- Create: `packages/tutor/src/images/gemini-image.ts`
- Create: `packages/tutor/src/images/image-store.ts`
- Test: `packages/tutor/src/images/gemini-image.test.ts`, `packages/tutor/src/images/image-store.test.ts`

**Interfaces:**
- Produces: `GeneratedImage { bytes: Buffer; mime_type: string }`, `ImageClient { generate(req: { prompt: string; signal?: AbortSignal }): Promise<GeneratedImage> }`, `GeminiImageClient`, `extractImage(json): GeneratedImage | null`, `ImageStore` (`key(parts)`, `get(key)`, `put(key, image)`, `urlFor(key, mime)`, `dir`).

Request used (Google docs read 2026-10-30): `POST https://generativelanguage.googleapis.com/v1beta/interactions` with header `x-goog-api-key` and body `{ model, input, response_format: { type: "image", mime_type, aspect_ratio, image_size } }`; the SDK exposes the picture as `interaction.output_image.data` (base64). The raw REST field names are **[verify day 0]**, so `extractImage` accepts `output_image.data` or any nested object that has a base64 `data` string and an `image/*` `mime_type`/`mimeType`.

- [ ] **Step 1: Write the failing tests**

Create `packages/tutor/src/images/gemini-image.test.ts`:

```ts
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
```

Create `packages/tutor/src/images/image-store.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mento/tutor test`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Implement**

Create `packages/tutor/src/images/gemini-image.ts`:

```ts
export interface GeneratedImage {
  bytes: Buffer;
  mime_type: string;
}

export interface ImageClient {
  generate(req: { prompt: string; signal?: AbortSignal }): Promise<GeneratedImage>;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Find the first base64 image in a Google response, whatever the exact field names are. */
export function extractImage(json: unknown): GeneratedImage | null {
  if (!isObject(json)) return null;
  const direct = json.output_image;
  if (isObject(direct) && typeof direct.data === "string") {
    return { bytes: Buffer.from(direct.data, "base64"), mime_type: String(direct.mime_type ?? direct.mimeType ?? "image/jpeg") };
  }
  const walk = (node: unknown): GeneratedImage | null => {
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }
    if (!isObject(node)) return null;
    const mime = node.mime_type ?? node.mimeType;
    if (typeof node.data === "string" && typeof mime === "string" && mime.startsWith("image/")) {
      return { bytes: Buffer.from(node.data, "base64"), mime_type: mime };
    }
    for (const value of Object.values(node)) {
      const found = walk(value);
      if (found) return found;
    }
    return null;
  };
  return walk(json);
}

/** Describes the JSON structure (keys only, no values) for error messages. */
function shapeOf(node: unknown, depth = 0): string {
  if (Array.isArray(node)) return `[${node.length ? shapeOf(node[0], depth + 1) : ""}]`;
  if (!isObject(node)) return typeof node;
  if (depth > 3) return "{…}";
  return `{${Object.entries(node).map(([k, v]) => `${k}: ${shapeOf(v, depth + 1)}`).join(", ")}}`;
}

export interface GeminiImageOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  aspectRatio?: string;
  fetchImpl?: typeof fetch;
}

export class GeminiImageClient implements ImageClient {
  constructor(private readonly opts: GeminiImageOptions) {}

  async generate(req: { prompt: string; signal?: AbortSignal }): Promise<GeneratedImage> {
    const { apiKey, model, baseUrl = "https://generativelanguage.googleapis.com", aspectRatio = "4:3", fetchImpl = fetch } = this.opts;
    const res = await fetchImpl(`${baseUrl}/v1beta/interactions`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: req.prompt,
        response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: aspectRatio, image_size: "1K" },
      }),
      signal: req.signal,
    });
    const text = await res.text();
    const redact = (s: string) => s.split(apiKey).join("***");
    if (!res.ok) throw new Error(`Gemini image failed: HTTP ${res.status} ${redact(text).slice(0, 300)}`);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Gemini image failed: response is not JSON: ${redact(text).slice(0, 120)}`);
    }
    const image = extractImage(json);
    if (!image) throw new Error(`Gemini image failed: no image in the response (shape: ${redact(shapeOf(json))})`);
    return image;
  }
}
```

Create `packages/tutor/src/images/image-store.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm --filter @mento/tutor test && pnpm --filter @mento/tutor typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tutor
git commit -m "feat(whiteboard): Gemini image client and the generated image cache"
```

---

### Task 3: The draw pipeline

**Files:**
- Create: `packages/tutor/src/images/draw-pipeline.ts`
- Modify: `packages/tutor/src/index.ts` (export the images modules)
- Test: `packages/tutor/src/images/draw-pipeline.test.ts`

**Interfaces:**
- Consumes: `DrawPipeline` (Plan 3 `hooks.ts`), `ImageClient`, `ImageStore`.
- Produces: `ImageDrawPipeline` (implements `DrawPipeline`), `captionOnlyDraw: DrawPipeline`, `IMAGE_STYLE`, `captionHtml(prompt)`.

Messages it returns (late, `order` is renumbered by the engine): success → `draw_result { element_id, url }`; any failure, timeout or `is_structured` → `update_element { id, html }` with a caption card, so the placeholder never stays empty.

- [ ] **Step 1: Write the failing test**

Create `packages/tutor/src/images/draw-pipeline.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mento/tutor test`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/tutor/src/images/draw-pipeline.ts`:

```ts
import type { Action, StreamMessage } from "@mento/contracts";
import type { DrawPipeline } from "../hooks";
import type { ImageClient } from "./gemini-image";
import type { ImageStore } from "./image-store";

export const IMAGE_STYLE =
  "Colored-pencil sketch, white background, no text, no frame, soft hand-drawn lines, educational illustration for a middle school history class.";

type DrawAction = Extract<Action, { name: "draw" }>;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Shown in place of an image that could not be generated in time. */
export const captionHtml = (prompt: string): string => `<p><i>[ilustração: ${escapeHtml(prompt)}]</i></p>`;

const lateAction = (id: string, name: "draw_result" | "update_element", args: unknown): StreamMessage =>
  ({ type: "action", order: 0, action: { id, name, args } }) as StreamMessage;

const fallback = (action: DrawAction): StreamMessage[] => [
  lateAction(`${action.id}_caption`, "update_element", { id: action.args.id, html: captionHtml(action.args.prompt) }),
];

/** Used when no image provider is configured: the placeholder becomes a caption card. */
export const captionOnlyDraw: DrawPipeline = { start: async (action) => fallback(action) };

export interface ImageDrawOptions {
  client: ImageClient;
  store: ImageStore;
  model: string;
  timeoutMs?: number;
  maxConcurrent?: number;
  log?: (message: string, extra?: unknown) => void;
}

class Semaphore {
  private active = 0;
  private readonly queue: (() => void)[] = [];
  constructor(private readonly limit: number) {}
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

/** Generates (or finds in the cache) the image of a `draw` action without ever throwing. */
export class ImageDrawPipeline implements DrawPipeline {
  private readonly semaphore: Semaphore;
  private readonly inflight = new Map<string, Promise<string | null>>();

  constructor(private readonly opts: ImageDrawOptions) {
    this.semaphore = new Semaphore(opts.maxConcurrent ?? 2);
  }

  private generate(key: string, prompt: string): Promise<string | null> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const { client, store, log } = this.opts;
    const job = this.semaphore
      .run(async () => {
        const cached = await store.get(key);
        if (cached) return store.urlFor(key, cached.mime_type);
        const image = await client.generate({ prompt });
        await store.put(key, image);
        return store.urlFor(key, image.mime_type);
      })
      .catch((err) => {
        log?.("image generation failed", err);
        return null;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return job;
  }

  async start(action: DrawAction, ctx: { session_id: string; signal: AbortSignal }): Promise<StreamMessage[]> {
    if (action.args.is_structured) return fallback(action); // SVG diagrams are a later plan
    const { store, model, timeoutMs = 12_000 } = this.opts;
    const key = store.key({ prompt: action.args.prompt, style: IMAGE_STYLE, model });
    // The job is independent of the client: it finishes into the cache even if the student left.
    const job = this.generate(key, `${action.args.prompt}. ${IMAGE_STYLE}`);
    const url = await Promise.race([job, new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs).unref?.())]);
    if (ctx.signal.aborted) return [];
    if (!url) return fallback(action);
    return [lateAction(`${action.id}_result`, "draw_result", { element_id: action.args.id, url })];
  }
}
```

Add to `packages/tutor/src/index.ts`:

```ts
export * from "./images/gemini-image";
export * from "./images/image-store";
export * from "./images/draw-pipeline";
```

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm --filter @mento/tutor test && pnpm --filter @mento/tutor typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tutor
git commit -m "feat(whiteboard): draw pipeline with cache, timeout, concurrency limit and caption fallback"
```

---

### Task 4: The judge and the evidence store

**Files:**
- Create: `packages/tutor/src/judge/evidence.ts`
- Create: `packages/tutor/src/judge/claude-judge.ts`
- Modify: `packages/tutor/src/index.ts` (export the judge modules)
- Test: `packages/tutor/src/judge/claude-judge.test.ts`

**Interfaces:**
- Consumes: `LlmClient`, `TurnRepository` (`listEvents`, `appendEvent`), `Retriever`, `Judge`, `JudgeInput`.
- Produces: `EvidenceInput`, `EvidenceStore { insertEvidence(e): Promise<{ id: string }> }`, `InMemoryEvidenceStore` (public `items`), `ClaudeJudge implements Judge`, `JudgmentSchema`.

- [ ] **Step 1: Write the failing test**

Create `packages/tutor/src/judge/claude-judge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Chunk, Retriever } from "@mento/contracts";
import { InMemoryTurnRepository, ScriptedLlm, stopEvent, toolEvent } from "../testing";
import { InMemoryEvidenceStore } from "./evidence";
import { ClaudeJudge } from "./claude-judge";

const passage: Chunk = { id: "c1", material_id: "m1", subject: "history", page: 12, passage_idx: 0, text: "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto." };
const retriever: Retriever = { searchChunks: async () => [passage], validateCitation: async () => true };

async function setup(llm: ScriptedLlm, hints = 2) {
  const repo = new InMemoryTurnRepository();
  const { id: session_id } = await repo.createSession({ student_id: "stu_1", modality: "text" });
  await repo.appendEvent(session_id, { type: "verification_asked", payload: { verification_id: "ver_1", element_id: "q1", concept: "Fim da República", concept_key: "fim da republica", question: "O que mudou depois de 27 a.C.?", kind: "explain" } });
  for (let level = 1; level <= hints; level++) await repo.appendEvent(session_id, { type: "hint_given", payload: { turn_id: "turn_1", level, verification_id: "ver_1", concept_key: "fim da republica" } });
  await repo.appendEvent(session_id, { type: "hint_given", payload: { turn_id: "turn_1", level: 1, verification_id: "ver_OTHER" } });
  await repo.appendEvent(session_id, { type: "verification_answered", payload: { verification_id: "ver_1", element_id: "q1", answer: "Roma passou a ter um imperador" } });
  const evidence = new InMemoryEvidenceStore();
  const judge = new ClaudeJudge({ llm, model: "judge-model", repo, retriever, evidence });
  return { repo, session_id, evidence, judge, llm };
}
const input = (session_id: string) => ({ session_id, student_id: "stu_1", verification_id: "ver_1", element_id: "q1", answer: "Roma passou a ter um imperador" });

describe("ClaudeJudge", () => {
  it("asks the judge model for a forced judgment, then stores evidence with hints counted from the events", async () => {
    const llm = new ScriptedLlm([[toolEvent("record_judgment", { result: "partial", rationale: "Citou o imperador, mas não explicou o Senado.", citation: { material_id: "m1", page: 12, quote: "o Senado concedeu a Otávio o título de Augusto" } }), stopEvent("tool_use")]]);
    const { judge, session_id, evidence, repo } = await setup(llm);
    await judge.start(input(session_id));

    const req = llm.calls[0]!;
    expect(req.model).toBe("judge-model");
    expect(req.tool_choice).toEqual({ type: "tool", name: "record_judgment" });
    expect(req.tools.map((t) => t.name)).toEqual(["record_judgment"]);
    const prompt = JSON.stringify(req.messages);
    expect(prompt).toContain("O que mudou depois de 27 a.C.?");
    expect(prompt).toContain("Roma passou a ter um imperador");
    expect(prompt).toContain("o Senado concedeu a Otávio");

    expect(evidence.items).toEqual([
      {
        session_id, student_id: "stu_1", concept: "Fim da República", concept_key: "fim da republica",
        result: "partial", independent: false, hints_used: 2,
        rationale: "Citou o imperador, mas não explicou o Senado.",
        citation: { material_id: "m1", page: 12, quote: "o Senado concedeu a Otávio o título de Augusto" },
      },
    ]);
    const recorded = (await repo.listEvents(session_id)).find((e) => e.type === "evidence_recorded");
    expect(recorded?.payload).toMatchObject({ verification_id: "ver_1", concept_key: "fim da republica", result: "partial", independent: false, hints_used: 2 });
  });

  it("marks a correct answer without hints as independent, and drops a citation the retriever rejects", async () => {
    const llm = new ScriptedLlm([[toolEvent("record_judgment", { result: "correct", rationale: "Explicou bem.", citation: { material_id: "m1", page: 1, quote: "inventada" } }), stopEvent("tool_use")]]);
    const { repo, session_id, evidence } = await setup(llm, 0);
    const rejecting = new ClaudeJudge({ llm, model: "j", repo, retriever: { searchChunks: async () => [], validateCitation: async () => false }, evidence });
    await rejecting.start(input(session_id));
    expect(evidence.items).toHaveLength(1);
    expect(evidence.items[0]).toMatchObject({ result: "correct", independent: true, hints_used: 0 });
    expect(evidence.items[0]?.citation).toBeUndefined();
  });

  it("stores nothing for an invalid judgment, a missing question or an LLM failure", async () => {
    const bad = new ScriptedLlm([[toolEvent("record_judgment", { result: "great" }), stopEvent("tool_use")]]);
    const a = await setup(bad);
    await a.judge.start(input(a.session_id));
    expect(a.evidence.items).toEqual([]);

    const ok = new ScriptedLlm([[toolEvent("record_judgment", { result: "correct", rationale: "ok" }), stopEvent("tool_use")]]);
    const b = await setup(ok);
    await b.judge.start({ ...input(b.session_id), verification_id: "ver_unknown" });
    expect(b.evidence.items).toEqual([]);
    expect(ok.calls).toHaveLength(0);

    const none = new ScriptedLlm([[stopEvent()]]);
    const c = await setup(none);
    await c.judge.start(input(c.session_id));
    expect(c.evidence.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mento/tutor test`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/tutor/src/judge/evidence.ts`:

```ts
import type { Citation } from "@mento/contracts";

/** One evidence row (contracts-spec §5) before the store adds its id and timestamp. */
export interface EvidenceInput {
  session_id: string;
  student_id: string;
  concept: string;
  concept_key: string;
  result: "correct" | "partial" | "incorrect";
  independent: boolean;
  hints_used: number;
  rationale: string;
  citation?: Citation;
}

/** Person 1's MongoDB repository implements this (`Repository.insertEvidence`). */
export interface EvidenceStore {
  insertEvidence(e: EvidenceInput): Promise<{ id: string }>;
}

export class InMemoryEvidenceStore implements EvidenceStore {
  readonly items: EvidenceInput[] = [];
  async insertEvidence(e: EvidenceInput): Promise<{ id: string }> {
    this.items.push(e);
    return { id: String(this.items.length).padStart(24, "0") };
  }
}
```

Create `packages/tutor/src/judge/claude-judge.ts`:

```ts
import { z } from "zod";
import { Citation, type Retriever } from "@mento/contracts";
import type { Judge, JudgeInput } from "../hooks";
import type { LlmClient } from "../llm";
import type { TurnRepository } from "../repository";
import type { ToolDef } from "../tools";
import type { EvidenceStore } from "./evidence";

export const JudgmentSchema = z.object({
  result: z.enum(["correct", "partial", "incorrect"]),
  rationale: z.string().min(1).max(300),
  citation: Citation.optional(),
});

const JUDGMENT_TOOL: ToolDef = {
  name: "record_judgment",
  description:
    "Record your judgment of the student's answer. result: correct (fully right), partial (right in part or imprecise), incorrect. rationale: one or two sentences in Brazilian Portuguese about what the answer shows, about the answer only. citation: optional, a short exact quote from the passages that supports the judgment.",
  input_schema: {
    type: "object",
    properties: {
      result: { type: "string", enum: ["correct", "partial", "incorrect"] },
      rationale: { type: "string", maxLength: 300 },
      citation: {
        type: "object",
        properties: { material_id: { type: "string" }, page: { type: "integer" }, quote: { type: "string" } },
        required: ["material_id", "page", "quote"],
      },
    },
    required: ["result", "rationale"],
  },
};

const SYSTEM = [
  {
    type: "text" as const,
    text: "You are a strict but fair grader of short answers from students in Brazilian schools (7º to 9º ano). Judge only what the student wrote against the question and the teacher's passages. Never infer anything about the student's personality, attention or emotions. Always call record_judgment.",
  },
];

export interface ClaudeJudgeDeps {
  llm: LlmClient;
  model: string;
  repo: Pick<TurnRepository, "listEvents" | "appendEvent">;
  retriever: Retriever;
  evidence: EvidenceStore;
  log?: (message: string, extra?: unknown) => void;
}

/** Judges a student's answer in the background and records evidence. Never throws. */
export class ClaudeJudge implements Judge {
  constructor(private readonly deps: ClaudeJudgeDeps) {}

  async start(input: JudgeInput): Promise<void> {
    const { llm, model, repo, retriever, evidence, log } = this.deps;
    try {
      const events = await repo.listEvents(input.session_id);
      const askedAt = events.findIndex((e) => e.type === "verification_asked" && (e.payload as { verification_id?: string })?.verification_id === input.verification_id);
      if (askedAt < 0) return log?.("judge: question not found", input.verification_id);
      const asked = events[askedAt]!.payload as { concept: string; concept_key: string; question: string };

      let answeredAt = events.findIndex((e, i) => i > askedAt && e.type === "verification_answered" && (e.payload as { verification_id?: string })?.verification_id === input.verification_id);
      if (answeredAt < 0) answeredAt = events.length;
      const hints_used = events.slice(askedAt + 1, answeredAt).filter((e) => e.type === "hint_given" && (e.payload as { verification_id?: string })?.verification_id === input.verification_id).length;

      const passages = await retriever.searchChunks({ query: `${asked.concept} ${asked.question}`, k: 3 });
      const prompt = [
        `Question: ${asked.question}`,
        `Concept: ${asked.concept}`,
        `Student answer: ${input.answer}`,
        `Hints given before the answer: ${hints_used}`,
        "Passages from the teacher's materials:",
        passages.length ? passages.map((p) => `[${p.material_id} · p.${p.page}] ${p.text}`).join("\n") : "(none)",
      ].join("\n");

      let raw: string | undefined;
      for await (const ev of llm.stream({ model, system: SYSTEM, tools: [JUDGMENT_TOOL], tool_choice: { type: "tool", name: "record_judgment" }, messages: [{ role: "user", content: prompt }], max_tokens: 400 })) {
        if (ev.type === "tool_block" && ev.block.name === "record_judgment") raw = ev.block.raw_input;
      }
      if (!raw) return log?.("judge: the model did not call record_judgment");
      const parsed = JudgmentSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return log?.("judge: invalid judgment", parsed.error.issues[0]);
      const judgment = parsed.data;

      const citation = judgment.citation && (await retriever.validateCitation(judgment.citation)) ? judgment.citation : undefined;
      const independent = hints_used === 0;
      const row = {
        session_id: input.session_id,
        student_id: input.student_id,
        concept: asked.concept,
        concept_key: asked.concept_key,
        result: judgment.result,
        independent,
        hints_used,
        rationale: judgment.rationale,
        citation,
      };
      const { id } = await evidence.insertEvidence(row);
      await repo.appendEvent(input.session_id, {
        type: "evidence_recorded",
        payload: { evidence_id: id, verification_id: input.verification_id, concept: asked.concept, concept_key: asked.concept_key, result: judgment.result, independent, hints_used, rationale: judgment.rationale, citation },
      });
    } catch (err) {
      log?.("judge failed", err);
    }
  }
}
```

Add to `packages/tutor/src/index.ts`: `export * from "./judge/evidence";` and `export * from "./judge/claude-judge";`.

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm --filter @mento/tutor test && pnpm --filter @mento/tutor typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tutor
git commit -m "feat(whiteboard): judge that records evidence with hints counted from events"
```

---

### Task 5: Serving images, wiring and the pregeneration script

**Files:**
- Create: `apps/api/src/routes/gen.ts`
- Modify: `apps/api/src/config.ts` (add `GEMINI_API_KEY`, `IMAGE_MODEL`), `apps/api/src/container.ts` (replace `buildEngine`, add `images`, `evidence`)
- Create: `fixtures/images/rome.json`
- Create: `scripts/pregenerate-images.ts`
- Modify: `.env.example`, root `package.json` (script `images:pregenerate`)
- Test: `apps/api/src/routes/gen.test.ts`

**Interfaces:**
- Consumes: `ImageDrawPipeline`, `captionOnlyDraw`, `GeminiImageClient`, `ImageStore`, `ClaudeJudge`, `InMemoryEvidenceStore`.
- Produces: `GET /api/gen/:file`; container members `images: ImageStore`, `evidence: EvidenceStore`; `pnpm images:pregenerate`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/gen.test.ts`:

```ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ImageStore } from "@mento/tutor";
import { buildApp } from "../app";
import { loadConfig } from "../config";

let app: FastifyInstance | undefined;
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mento-gen-"));
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  await rm(dir, { recursive: true, force: true });
});

const key = "0123456789abcdef0123456789abcdef";

describe("GET /api/gen/:file", () => {
  it("serves a cached image with its content type and long-lived caching", async () => {
    await writeFile(join(dir, `${key}.jpg`), Buffer.from([1, 2, 3]));
    app = await buildApp(loadConfig({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv), { images: new ImageStore(dir) });
    const res = await app.inject({ url: `/api/gen/${key}.jpg` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toContain("immutable");
    expect([...res.rawPayload]).toEqual([1, 2, 3]);
  });

  it("answers 404 for a missing image and 400 for names that are not a cache key", async () => {
    app = await buildApp(loadConfig({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv), { images: new ImageStore(dir) });
    expect((await app.inject({ url: `/api/gen/${key}.jpg` })).statusCode).toBe(404);
    expect((await app.inject({ url: "/api/gen/..%2F..%2F.env" })).statusCode).toBe(400);
    expect((await app.inject({ url: "/api/gen/notakey.jpg" })).statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mento/api test`
Expected: FAIL (no route; the container has no `images`).

- [ ] **Step 3: Implement the route, config and wiring**

Create `apps/api/src/routes/gen.ts`:

```ts
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

const CONTENT_TYPE: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Owner: Person 3. GET /api/gen/:file serves images generated by the draw pipeline (file = <cache key>.<ext>).
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/gen/:file",
    { schema: { params: z.object({ file: z.string().regex(/^[a-f0-9]{32}\.(jpg|png|webp)$/) }) } },
    async (request, reply) => {
      const { file } = request.params;
      const [key, ext] = file.split(".") as [string, string];
      const image = await request.server.container.images.get(key);
      if (!image || image.mime_type !== CONTENT_TYPE[ext]) return reply.status(404).send({ error: "image_not_found" });
      return reply
        .header("Content-Type", image.mime_type)
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .send(image.bytes);
    },
  );
};

export default plugin;
```

Add to the schema in `apps/api/src/config.ts`:

```ts
  GEMINI_API_KEY: z.string().default(""),
  IMAGE_MODEL: z.string().default("gemini-3.1-flash-lite-image"),
```

In `apps/api/src/container.ts` make these changes:

1. Add to the imports from `@mento/tutor`: `ClaudeJudge, GeminiImageClient, ImageDrawPipeline, ImageStore, InMemoryEvidenceStore, captionOnlyDraw, type DrawPipeline, type EvidenceStore`.
2. Add to the `Container` interface:

```ts
  /** Generated images (served by GET /api/gen/:file). */
  images: ImageStore;
  /** In memory until Person 1's MongoDB repository implements insertEvidence. */
  evidence: EvidenceStore;
```

3. Replace `buildEngine` with:

```ts
function buildDraw(config: Config, images: ImageStore): DrawPipeline {
  if (!config.GEMINI_API_KEY) return captionOnlyDraw;
  return new ImageDrawPipeline({
    client: new GeminiImageClient({ apiKey: config.GEMINI_API_KEY, model: config.IMAGE_MODEL }),
    store: images,
    model: config.IMAGE_MODEL,
  });
}

function buildEngine(config: Config, repo: TurnRepository, tts: TtsService | null, images: ImageStore, evidence: EvidenceStore): TurnEngine | null {
  if (!config.ANTHROPIC_API_KEY) return null;
  const llm = new AnthropicLlm({ apiKey: config.ANTHROPIC_API_KEY });
  const retriever = emptyRetriever; // Plan 5 replaces this with the MongoDB hybrid search
  return new TurnEngine({
    llm,
    repo,
    retriever,
    tts,
    draw: buildDraw(config, images),
    judge: new ClaudeJudge({ llm, model: config.JUDGE_MODEL, repo, retriever, evidence }),
    prompts: loadPromptsSync(config.PROMPTS_DIR),
    models: { tutor: config.TUTOR_MODEL },
  });
}
```

4. Replace `createContainer` with:

```ts
export function createContainer(config: Config, overrides: Partial<Container> = {}): Container {
  const tts = "tts" in overrides ? (overrides.tts ?? null) : buildTts(config);
  const repo =
    overrides.repo ??
    new InMemoryTurnRepository({
      catalog: [{ material_id: "demo-roma", title: "História de Roma (demo)", subject: "history", chapters: ["A República", "O Império"] }],
    });
  const images = overrides.images ?? new ImageStore(join(config.DATA_DIR, "files", "gen"));
  const evidence = overrides.evidence ?? new InMemoryEvidenceStore();
  const engine = "engine" in overrides ? (overrides.engine ?? null) : buildEngine(config, repo, tts, images, evidence);
  return { config, mongo: new MongoService(config.MONGODB_URI), mintSttToken, ...overrides, tts, repo, images, evidence, engine };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @mento/api test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Add the Rome prompts and the pregeneration/comparison script**

Create `fixtures/images/rome.json`:

```json
{
  "prompts": [
    { "name": "colosseum", "prompt": "The Roman Colosseum seen from outside, with its arches and tiers." },
    { "name": "aqueduct", "prompt": "A Roman aqueduct with a long row of stone arches crossing a valley." },
    { "name": "legionary", "prompt": "A Roman legionary soldier with shield, helmet and short sword, full body." },
    { "name": "forum", "prompt": "The Roman Forum with columns, temples and people in togas." },
    { "name": "ship", "prompt": "A Roman merchant ship with a square sail on the Mediterranean sea." },
    { "name": "map-empire", "prompt": "A simple hand-drawn map of the Mediterranean sea surrounded by the Roman Empire territory." }
  ]
}
```

Create `scripts/pregenerate-images.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GeminiImageClient, IMAGE_STYLE, ImageStore } from "@mento/tutor";

process.loadEnvFile(new URL("../.env", import.meta.url));
const arg = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const model = arg("model", process.env.IMAGE_MODEL ?? "gemini-3.1-flash-lite-image");
const rounds = Number(arg("rounds", "1"));
const only = arg("only", "");
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env");

const { prompts } = JSON.parse(readFileSync(new URL("../fixtures/images/rome.json", import.meta.url), "utf8")) as { prompts: { name: string; prompt: string }[] };
const dataDir = process.env.DATA_DIR ?? fileURLToPath(new URL("../data", import.meta.url));
const store = new ImageStore(`${dataDir}/files/gen`);
const compareStore = new ImageStore(`${dataDir}/files/gen-compare/${model}`);
const client = new GeminiImageClient({ apiKey, model });

console.log(`model: ${model}, rounds: ${rounds}`);
const times: number[] = [];
for (const { name, prompt } of prompts.filter((p) => !only || p.name === only)) {
  for (let round = 1; round <= rounds; round++) {
    const full = `${prompt}. ${IMAGE_STYLE}`;
    const t0 = performance.now();
    try {
      const image = await client.generate({ prompt: full });
      const ms = performance.now() - t0;
      times.push(ms);
      // Round 1 seeds the real cache (same key the pipeline uses); every round is kept for the visual comparison.
      if (round === 1) await store.put(store.key({ prompt, style: IMAGE_STYLE, model }), image);
      await compareStore.put(`${name}-r${round}`.padEnd(32, "0").slice(0, 32), image);
      console.log(`${name} r${round}: ${ms.toFixed(0)} ms, ${(image.bytes.length / 1024).toFixed(0)} KB, ${image.mime_type}`);
    } catch (err) {
      console.log(`${name} r${round}: FAILED ${(err as Error).message}`);
    }
  }
}
if (times.length) {
  const sorted = [...times].sort((a, b) => a - b);
  console.log(`\n${times.length} images, p50 ${sorted[Math.floor(sorted.length / 2)]!.toFixed(0)} ms, max ${sorted.at(-1)!.toFixed(0)} ms, estimated cost $${(times.length * 0.0336).toFixed(2)}`);
  console.log(`Seeded cache: ${dataDir}/files/gen · comparison copies: ${dataDir}/files/gen-compare/${model}`);
}
```

Add to the root `package.json` `scripts`: `"images:pregenerate": "tsx scripts/pregenerate-images.ts"`. Append to `.env.example`: `GEMINI_API_KEY=` and `IMAGE_MODEL=gemini-3.1-flash-lite-image`. The `compareStore` file names are the label padded to 32 characters, which is a hack to reuse `ImageStore.put`; the comparison files are for looking at, not for the API.

- [ ] **Step 6: Day-0 run (needs billing enabled on the Gemini project)**

Run: `pnpm images:pregenerate --model=gemini-3.1-flash-lite-image --rounds=2` and then `pnpm images:pregenerate --model=gemini-nano-banana-2.1 --rounds=2`
Expected: one line per image with its time and size, then a p50/max summary and the estimated cost; open `data/files/gen-compare/<model>/` to compare style. If a line says `no image in the response (shape: …)`, copy the shape: it shows the real response field names, and the fix is in `extractImage` (Task 2). If it says `HTTP 429 … Free Tier`, billing is not enabled on that key's project.
Record the p50 times and the chosen model in spec §11 (Day-0 check 4).

- [ ] **Step 7: Commit**

```bash
git add apps scripts fixtures .env.example package.json
git commit -m "feat(whiteboard): serve generated images, wire draw and judge, add the pregeneration script"
```

---

## Self-review

- **Spec coverage:** §7 drawing (placeholder first, background job, `draw_result`, cache by hash, style prefix, 12 s timeout, caption fallback, max 2 concurrent, cancelled jobs still cache, Gemini client, pre-generated seed, cost logging via the script) → Tasks 2, 3, 5; §6 verification and judge (Haiku, parallel to the next turn, `independent`, `hints_used` from events, evidence event) → Tasks 1, 4, 5; `multiply` CSS trick is front-end (documented in Plan 1's `docs/frontend-contract.md`). Not here by design: structured SVG diagrams (Should), judge-vs-tutor disagreement measurement (needs real conversations), the MongoDB `insertEvidence` (Person 1).
- **Placeholders:** none; the unconfirmed Google response shape has a tolerant extractor plus a diagnostic error, and a Day-0 step.
- **Type consistency:** `DrawPipeline.start(action, { session_id, signal })`, `Judge.start(JudgeInput)`, `ImageClient`, `ImageStore.key/get/put/urlFor`, `EvidenceStore.insertEvidence`, `LlmRequest.tool_choice` and the container members `images`/`evidence` are used identically across tasks and match Plan 3.
