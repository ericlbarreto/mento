import { fromHttpAlignment } from "../alignment";
import type { TtsChunk, TtsProvider, TtsRequest } from "./types";

export interface ElevenLabsHttpOptions {
  apiKey: string;
  voiceId: string;
  modelId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Simple, reliable path: one request returns the whole audio plus character timings. */
export class ElevenLabsHttpProvider implements TtsProvider {
  constructor(private readonly opts: ElevenLabsHttpOptions) {}

  async *synthesize(req: TtsRequest): AsyncGenerator<TtsChunk> {
    const { apiKey, voiceId, modelId, baseUrl = "https://api.elevenlabs.io", fetchImpl = fetch } = this.opts;
    const body: Record<string, unknown> = { text: req.text, model_id: modelId, language_code: "pt" };
    if (req.previous_text) body.previous_text = req.previous_text;
    if (req.next_text) body.next_text = req.next_text;

    const res = await fetchImpl(`${baseUrl}/v1/text-to-speech/${voiceId}/with-timestamps?output_format=pcm_24000`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: req.signal,
    });
    if (!res.ok) throw new Error(`ElevenLabs TTS failed: HTTP ${res.status}`);
    const json = (await res.json()) as {
      audio_base64: string;
      alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } | null;
    };
    yield { audio: Buffer.from(json.audio_base64, "base64"), chars: json.alignment ? fromHttpAlignment(json.alignment) : [] };
  }
}
