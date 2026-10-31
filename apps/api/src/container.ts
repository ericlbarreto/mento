import { join } from "node:path";
import type { Retriever, SessionHistory, SubjectStore } from "@mento/contracts";
import { MongoChunkStore, MongoEvidenceStore, MongoSubjectStore, MongoTurnRepository, mongoState } from "@mento/db";
import { createRetriever, embedWithVoyage } from "@mento/sources";
import {
  AnthropicLlm,
  ClaudeJudge,
  GeminiImageClient,
  ImageDrawPipeline,
  ImageStore,
  TurnEngine,
  captionOnlyDraw,
  emptyRetriever,
  loadPromptsSync,
  type DrawPipeline,
  type EvidenceStore,
  type TurnRepository,
} from "@mento/tutor";
import { createTtsService, isVoiceConfigError, mintSttToken, type TtsService } from "@mento/voice/server";
import type { Config } from "./config";
import { MongoService } from "./services/mongo.service";

export interface Container {
  config: Config;
  mongo: MongoService;
  mintSttToken: typeof mintSttToken;
  /** null when ElevenLabs is not configured: the audio route answers 503 and the tutor falls back to captions. */
  tts: TtsService | null;
  /** Sessions and events in MongoDB (collections `sessions`, `events`). */
  repo: TurnRepository;
  images: ImageStore;
  /** Judged answers in MongoDB (collection `evidence`). */
  evidence: EvidenceStore;
  /** History read side (list and re-open sessions). */
  history: SessionHistory;
  /** Hybrid search over the teacher's materials; finds nothing until VOYAGE_API_KEY and MongoDB Atlas are set up. */
  retriever: Retriever;
  /** Subjects (matérias) and their materials, stored in MongoDB. */
  subjects: SubjectStore;
  /** True while MongoDB is connected (routes that need it answer 503 otherwise). */
  dbReady: () => boolean;
  /** null when ANTHROPIC_API_KEY is not set: the turn route answers 503. */
  engine: TurnEngine | null;
}

const isMongoUp = () => mongoState() === "connected";

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

function buildRetriever(config: Config, store: MongoChunkStore): Retriever {
  if (!config.VOYAGE_API_KEY) return emptyRetriever;
  return createRetriever({ store, embed: embedWithVoyage({ apiKey: config.VOYAGE_API_KEY }), isAvailable: isMongoUp });
}

function buildEngine(config: Config, repo: TurnRepository, tts: TtsService | null, images: ImageStore, evidence: EvidenceStore, retriever: Retriever): TurnEngine | null {
  if (!config.ANTHROPIC_API_KEY) return null;
  const llm = new AnthropicLlm({ apiKey: config.ANTHROPIC_API_KEY });
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
  const store = new MongoChunkStore();
  const mongoRepo = new MongoTurnRepository(store);
  const repo = overrides.repo ?? mongoRepo;
  const images = overrides.images ?? new ImageStore(join(config.DATA_DIR, "files", "gen"));
  const evidence = overrides.evidence ?? new MongoEvidenceStore();
  const history = overrides.history ?? mongoRepo;
  const retriever = overrides.retriever ?? buildRetriever(config, store);
  const engine = "engine" in overrides ? (overrides.engine ?? null) : buildEngine(config, repo, tts, images, evidence, retriever);
  const subjects = overrides.subjects ?? new MongoSubjectStore();
  const dbReady = overrides.dbReady ?? isMongoUp;
  return { config, mongo: new MongoService(config.MONGODB_URI), mintSttToken, ...overrides, tts, repo, images, evidence, history, retriever, subjects, dbReady, engine };
}
