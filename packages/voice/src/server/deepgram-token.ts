import { VoiceConfigError } from "./errors";

export const DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen";

/** Query parameters the browser appends to the Deepgram WebSocket URL (single source of truth). */
export const DEEPGRAM_LISTEN_PARAMS: Record<string, string> = {
  model: "nova-3",
  language: "pt-BR",
  encoding: "linear16",
  sample_rate: "16000",
  channels: "1",
  interim_results: "true",
  endpointing: "300",
  utterance_end_ms: "1000",
  vad_events: "true",
  smart_format: "true",
  punctuate: "true",
};

export interface MintTokenInput {
  apiKey: string;
  ttlSeconds?: number;
  fetchImpl?: typeof fetch;
}

/** Short-lived Deepgram JWT for the browser (docs: POST /v1/auth/grant, default TTL 30 s). */
export async function mintSttToken(input: MintTokenInput): Promise<{ token: string; expires_in: number }> {
  const { apiKey, ttlSeconds = 30, fetchImpl = fetch } = input;
  if (!apiKey) throw new VoiceConfigError("DEEPGRAM_API_KEY is not set");
  const res = await fetchImpl("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: ttlSeconds }),
  });
  if (!res.ok) throw new Error(`Deepgram token grant failed: HTTP ${res.status}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Deepgram token grant returned no access_token");
  return { token: body.access_token, expires_in: body.expires_in ?? ttlSeconds };
}
