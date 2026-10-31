import { join } from "node:path";
import {
  AnthropicLlm,
  ClaudeJudge,
  GeminiImageClient,
  ImageDrawPipeline,
  ImageStore,
  InMemoryEvidenceStore,
  TurnEngine,
  captionOnlyDraw,
  emptyRetriever,
  loadPromptsSync,
  type DrawPipeline,
  type EvidenceStore,
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
  /** Generated images (served by GET /api/gen/:file). */
  images: ImageStore;
  /** In memory until Person 1's MongoDB repository implements insertEvidence. */
  evidence: EvidenceStore;
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

function buildDraw(config: Config, images: ImageStore): DrawPipeline {
  if (!config.GEMINI_API_KEY) return captionOnlyDraw;
  return new ImageDrawPipeline({
    client: new GeminiImageClient({ apiKey: config.GEMINI_API_KEY, model: config.IMAGE_MODEL }),
    store: images,
    model: config.IMAGE_MODEL,
  });
}

function buildEngine(config: Config, repo: TurnRepository, tts: TtsService | null, images: ImageStore, evidence: EvidenceStore): TurnEngine | null {
  if (!config.ANTHROPIC_API_KEY) return null;
  const llm = new AnthropicLlm({ apiKey: config.ANTHROPIC_API_KEY });
  const retriever = emptyRetriever; // Plan 5 replaces this with the MongoDB hybrid search
  return new TurnEngine({
    llm,
    repo,
    retriever,
    tts,
    draw: buildDraw(config, images),
    judge: new ClaudeJudge({ llm, model: config.JUDGE_MODEL, repo, retriever, evidence }),
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
  const images = overrides.images ?? new ImageStore(join(config.DATA_DIR, "files", "gen"));
  const evidence = overrides.evidence ?? new InMemoryEvidenceStore();
  const engine = "engine" in overrides ? (overrides.engine ?? null) : buildEngine(config, repo, tts, images, evidence);
  return { config, mongo: new MongoService(config.MONGODB_URI), mintSttToken, ...overrides, tts, repo, images, evidence, engine };
}
