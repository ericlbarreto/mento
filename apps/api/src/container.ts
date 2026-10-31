import { createTtsService, isVoiceConfigError, mintSttToken, type TtsService } from "@mento/voice/server";
import { join } from "node:path";
import type { Config } from "./config";
import { MongoService } from "./services/mongo.service";

export interface Container {
  config: Config;
  mongo: MongoService;
  mintSttToken: typeof mintSttToken;
  /** null when ElevenLabs is not configured: the audio route answers 503 and the tutor falls back to captions. */
  tts: TtsService | null;
}

function buildTts(config: Config): TtsService | null {
  try {
    return createTtsService({
      provider: config.TTS_MODE,
      apiKey: config.ELEVENLABS_API_KEY,
      voiceId: config.ELEVENLABS_VOICE_ID,
      modelId: config.ELEVENLABS_MODEL,
      cacheDir: join(config.DATA_DIR, "files", "tts"),
    });
  } catch (err) {
    if (isVoiceConfigError(err)) return null;
    throw err;
  }
}

export function createContainer(config: Config, overrides: Partial<Container> = {}): Container {
  return {
    config,
    mongo: new MongoService(config.MONGODB_URI),
    mintSttToken,
    tts: "tts" in overrides ? (overrides.tts ?? null) : buildTts(config),
    ...overrides,
  };
}
