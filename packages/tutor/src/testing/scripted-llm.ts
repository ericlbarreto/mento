import { LlmError, type LlmClient, type LlmEvent, type LlmRequest } from "../llm";

let nextId = 0;

/** A completed tool call, as the real client would yield it. */
export const toolEvent = (name: string, input: unknown, id = `toolu_${++nextId}`): LlmEvent => ({
  type: "tool_block",
  block: { id, name, raw_input: typeof input === "string" ? input : JSON.stringify(input) },
});
export const stopEvent = (stop_reason = "end_turn"): LlmEvent => ({ type: "stop", stop_reason });
export const firstTokenEvent = (): LlmEvent => ({ type: "first_token" });

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

/**
 * Fake LLM for tests: each `stream()` call plays the next scripted round (the last round repeats),
 * waits `delayMs` before the first event, and can fail the very first call.
 */
export class ScriptedLlm implements LlmClient {
  readonly calls: LlmRequest[] = [];
  prewarmed = 0;
  readonly prewarmRequests: Omit<LlmRequest, "signal" | "max_tokens">[] = [];
  private next = 0;

  constructor(
    private readonly rounds: LlmEvent[][],
    private readonly opts: { delayMs?: number; failFirst?: LlmError } = {},
  ) {}

  async *stream(req: LlmRequest): AsyncGenerator<LlmEvent> {
    this.calls.push(req);
    if (this.opts.failFirst && this.calls.length === 1) throw this.opts.failFirst;
    const round = this.rounds[Math.min(this.next++, this.rounds.length - 1)] ?? [];
    if (this.opts.delayMs) await sleep(this.opts.delayMs, req.signal);
    for (const ev of round) {
      if (req.signal?.aborted) return;
      yield ev;
    }
  }

  async prewarm(req: Omit<LlmRequest, "signal" | "max_tokens">): Promise<void> {
    this.prewarmed += 1;
    this.prewarmRequests.push(req);
  }
}
