import Anthropic from "@anthropic-ai/sdk";
import { LlmError, type LlmClient, type LlmEvent, type LlmRequest } from "./llm";
import { ToolBlockAssembler, type RawStreamEvent } from "./tool-assembler";

export function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  const status = (err as { status?: number } | null)?.status;
  const message = err instanceof Error ? err.message : String(err);
  const retryable = status !== undefined && (status === 429 || status === 529 || status >= 500);
  return new LlmError(message, status, retryable);
}

export function requestParams(req: Omit<LlmRequest, "signal">) {
  return {
    model: req.model,
    max_tokens: req.max_tokens,
    system: req.system,
    tools: req.tools,
    messages: req.messages,
    ...(req.tool_choice ? { tool_choice: req.tool_choice } : {}),
    ...(req.thinking ? { thinking: req.thinking } : {}),
    ...(req.effort ? { output_config: { effort: req.effort } } : {}),
  };
}

export interface AnthropicLlmOptions {
  apiKey: string;
  baseURL?: string;
}

/** Streams a turn from the Anthropic Messages API and turns it into `LlmEvent`s (no SDK types leak out). */
export class AnthropicLlm implements LlmClient {
  private readonly client: Anthropic;

  constructor(opts: AnthropicLlmOptions) {
    // maxRetries 0: the turn engine owns the retry policy (one retry, only before any action was emitted).
    this.client = new Anthropic({ apiKey: opts.apiKey, baseURL: opts.baseURL, maxRetries: 0 });
  }

  async *stream(req: LlmRequest): AsyncGenerator<LlmEvent> {
    const assembler = new ToolBlockAssembler();
    let first = false;
    let stop_reason = "end_turn";
    const usage: NonNullable<Extract<LlmEvent, { type: "stop" }>["usage"]> = {};
    try {
      const stream = this.client.messages.stream(requestParams(req) as unknown as Anthropic.MessageStreamParams, { signal: req.signal });
      for await (const event of stream) {
        const ev = event as unknown as RawStreamEvent & {
          message?: { usage?: Record<string, number> };
          usage?: Record<string, number>;
          delta?: { stop_reason?: string };
        };
        if (!first && (ev.type === "content_block_start" || ev.type === "content_block_delta")) {
          first = true;
          yield { type: "first_token" };
        }
        if (ev.type === "message_start" && ev.message?.usage) Object.assign(usage, ev.message.usage);
        if (ev.type === "message_delta") {
          if (ev.delta?.stop_reason) stop_reason = ev.delta.stop_reason;
          if (ev.usage) Object.assign(usage, ev.usage);
        }
        for (const block of assembler.push(ev)) yield { type: "tool_block", block };
      }
    } catch (err) {
      if (req.signal?.aborted) return;
      throw toLlmError(err);
    }
    yield { type: "stop", stop_reason, usage };
  }

  async prewarm(req: Omit<LlmRequest, "signal" | "max_tokens">): Promise<void> {
    try {
      await this.client.messages.create(requestParams({ ...req, max_tokens: 0 }) as unknown as Anthropic.MessageCreateParamsNonStreaming);
    } catch (err) {
      throw toLlmError(err);
    }
  }
}
