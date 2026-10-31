import type { SystemBlock } from "./prompt-builder";
import type { ToolBlock } from "./tool-assembler";
import type { ToolDef } from "./tools";

export interface LlmUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export type LlmEvent =
  | { type: "first_token" }
  | { type: "tool_block"; block: ToolBlock }
  | { type: "stop"; stop_reason: string; usage?: LlmUsage };

export type LlmContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface LlmMessage {
  role: "user" | "assistant";
  content: string | LlmContentBlock[];
}

export interface LlmRequest {
  model: string;
  system: SystemBlock[];
  tools: ToolDef[];
  messages: LlmMessage[];
  max_tokens: number;
  /** Force the model to call one tool (used by the judge). Changing it invalidates the message cache only. */
  tool_choice?: { type: "tool"; name: string };
  signal?: AbortSignal;
}

export interface LlmClient {
  stream(req: LlmRequest): AsyncGenerator<LlmEvent>;
  /** Write the static prefix into the provider's prompt cache (no output). */
  prewarm?(req: Omit<LlmRequest, "signal" | "max_tokens">): Promise<void>;
}

export class LlmError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message);
    this.name = "LlmError";
  }
}
