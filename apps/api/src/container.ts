import { join } from "node:path";
import {
  AnthropicLlm,
  TurnEngine,
  emptyRetriever,
  loadPromptsSync,
  noopDraw,
  noopJudge,
  type TurnRepository,
} from "@mento/tutor";
import { InMemoryTurnRepository } from "@mento/tutor/testing";
import { createTtsService, isVoiceConfigError, mintSttToken, type TtsService } from "@mento/voice/server";
import type { Config } from "./config";
import { MongoService } from "./services/mongo.service";

export interface Container {
  config: Config;
  mongo: MongoService;
  mintSttToken: typeof mintSttToken;
  /** null when ElevenLabs is not configured: the audio route answers 503 and the tutor falls back to captions. */
  tts: TtsService | null;
  /** In memory until Person 1's MongoDB repository replaces it. */
  repo: TurnRepository;
  /** null when ANTHROPIC_API_KEY is not set: the turn route answers 503. */
  engine: TurnEngine | null;
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

function buildEngine(config: Config, repo: TurnRepository, tts: TtsService | null): TurnEngine | null {
  if (!config.ANTHROPIC_API_KEY) return null;
  return new TurnEngine({
    llm: new AnthropicLlm({ apiKey: config.ANTHROPIC_API_KEY }),
    repo,
    retriever: emptyRetriever, // Plan 5 replaces this with the MongoDB hybrid search
    tts,
    draw: noopDraw, // Plan 4
    judge: noopJudge, // Plan 4
    prompts: loadPromptsSync(config.PROMPTS_DIR),
    models: { tutor: config.TUTOR_MODEL },
  });
}

export function createContainer(config: Config, overrides: Partial<Container> = {}): Container {
  const tts = "tts" in overrides ? (overrides.tts ?? null) : buildTts(config);
  const repo =
    overrides.repo ??
    new InMemoryTurnRepository({
      catalog: [{ material_id: "demo-roma", title: "História de Roma (demo)", subject: "history", chapters: ["A República", "O Império"] }],
    });
  const engine = "engine" in overrides ? (overrides.engine ?? null) : buildEngine(config, repo, tts);
  return { config, mongo: new MongoService(config.MONGODB_URI), mintSttToken, ...overrides, tts, repo, engine };
}
