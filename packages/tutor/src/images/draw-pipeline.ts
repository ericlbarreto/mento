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
