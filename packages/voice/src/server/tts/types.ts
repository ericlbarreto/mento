import type { CharTiming } from "../alignment";

/** One piece of synthesized speech: PCM s16le 24 kHz mono audio plus the characters it covers (absolute ms). */
export interface TtsChunk {
  audio: Buffer;
  chars: CharTiming[];
}

export interface TtsRequest {
  text: string;
  /** Text spoken just before / after, to keep prosody continuous (HTTP provider only). */
  previous_text?: string;
  next_text?: string;
  signal?: AbortSignal;
}

export interface TtsProvider {
  synthesize(req: TtsRequest): AsyncGenerator<TtsChunk>;
  /** Prepare a connection ahead of the next `synthesize` (optional). */
  warm?(): void;
  close?(): void;
}
