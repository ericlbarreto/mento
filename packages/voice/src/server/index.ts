import type { TtsProvider } from "./tts/types";
import { ElevenLabsHttpProvider } from "./tts/elevenlabs-http";
import { ElevenLabsWsProvider } from "./tts/elevenlabs-ws";
import { TtsCache } from "./tts/cache";
import { TtsService } from "./tts/service";
import { VoiceConfigError } from "./errors";

export * from "./alignment";
export * from "./async-queue";
export * from "./errors";
export * from "./deepgram-token";
export * from "./tts/types";
export * from "./tts/cache";
export * from "./tts/service";
export { ElevenLabsHttpProvider } from "./tts/elevenlabs-http";
export { ElevenLabsWsProvider } from "./tts/elevenlabs-ws";

export interface CreateTtsServiceOptions {
  provider: "http" | "ws";
  apiKey: string;
  voiceId: string;
  modelId: string;
  cacheDir: string;
}

/** Build the TTS service for the chosen provider. Opens the spare socket right away in `ws` mode. */
export function createTtsService(opts: CreateTtsServiceOptions): TtsService {
  if (!opts.apiKey) throw new VoiceConfigError("ELEVENLABS_API_KEY is not set");
  if (!opts.voiceId) throw new VoiceConfigError("ELEVENLABS_VOICE_ID is not set");
  const base = { apiKey: opts.apiKey, voiceId: opts.voiceId, modelId: opts.modelId };
  const provider: TtsProvider = opts.provider === "ws" ? new ElevenLabsWsProvider(base) : new ElevenLabsHttpProvider(base);
  provider.warm?.();
  return new TtsService({ provider, cache: new TtsCache(opts.cacheDir), voiceId: opts.voiceId, modelId: opts.modelId });
}
