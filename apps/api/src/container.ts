import path, { join } from "node:path";
import type { ChunkStore, ConversationSource, ExerciseListStore, Retriever, SessionHistory, SubjectStore, TeacherRepository } from "@mento/contracts";
import { MongoChunkStore, MongoConversationReader, MongoEvidenceStore, MongoExerciseListStore, MongoRepository, MongoSubjectStore, MongoTurnRepository, mongoState } from "@mento/db";
import { createRetriever, embedWithVoyage, DiskFileStore, MaterialIngestQueue, type Embed, type FileStore, type SequenceLlm } from "@mento/sources";
import {
  AnalysisService,
  ClaudeExerciseGenerator,
  ExerciseListService,
  FileConversationSource,
  MongoConversationSource,
  SessionEndedHandler,
  SubjectScope,
  idMapsFromRepo,
  type AnalysisWriter,
  type ExerciseGenerator,
} from "@mento/analysis";
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
import { TeacherBus } from "./services/bus";
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
  /** Embedded passages (`chunks`) and the catalog of ready materials: what the tutor reads and the upload fills. */
  chunkStore: ChunkStore;
  /** Voyage embeddings; null without VOYAGE_API_KEY (the upload then answers 503 `embeddings_unavailable`). */
  embed: Embed | null;
  /** Subjects (matérias) and their materials, stored in MongoDB. */
  subjects: SubjectStore;
  /** True while MongoDB is connected (routes that need it answer 503 otherwise). */
  dbReady: () => boolean;
  /** null when ANTHROPIC_API_KEY is not set: the turn route answers 503. */
  engine: TurnEngine | null;

  // ---- Teacher side (Person 1): students, insights, material uploads ----
  /** Students, class context, uploaded materials, analyses and insights (MongoDB). Not the whiteboard's `repo`. */
  teacherRepo: TeacherRepository;
  /** The conversations the whiteboard stored in MongoDB (sessions, events, evidences), read for the analysis. */
  conversations: ConversationSource;
  analysis: AnalysisService;
  /** `POST /api/sessions/:id/end` calls `sessionEnded.handle(id)`: waits for the judge, analyses, one retry after 30 s. */
  sessionEnded: SessionEndedHandler;
  /** Live feed behind `GET /api/stream/teacher`. */
  bus: TeacherBus;
  /** Where uploaded PDFs are kept. */
  fileStore: FileStore;
  ingest: MaterialIngestQueue;
  /** Generated exercise lists (`exercise_lists`) and the service that writes them with Claude (D72). */
  exerciseLists: ExerciseListStore;
  exercises: ExerciseListService;
}

/** Things only the teacher side needs to replace (tests, a different deployment). */
export interface TeacherOverrides {
  /** Optional LLM writer for the analysis; without it the deterministic template writes the text. */
  writer?: AnalysisWriter;
  /** Optional LLM used to extract the lesson sequence of an uploaded material. */
  sequenceLlm?: SequenceLlm;
  now?: () => string;
  log?: (message: string, error?: unknown) => void;
  /** Delay before the single automatic retry of a failed analysis. */
  retryDelayMs?: number;
  /** Writes the exercise lists; default Claude (`EXERCISES_MODEL`), null without ANTHROPIC_API_KEY. */
  exerciseGenerator?: ExerciseGenerator | null;
}

export type ContainerOverrides = Partial<Container> & TeacherOverrides;

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

function buildEngine(config: Config, repo: TurnRepository, tts: TtsService | null, images: ImageStore, evidence: EvidenceStore, retriever: Retriever): TurnEngine | null {
  if (!config.ANTHROPIC_API_KEY) return null;
  const llm = new AnthropicLlm({ apiKey: config.ANTHROPIC_API_KEY });
  return new TurnEngine({
    llm,
    repo,
    retriever,
    tts,
    draw: buildDraw(config, images),
    judge: new ClaudeJudge({ llm, model: config.JUDGE_MODEL, repo, retriever, evidence, log: (message, extra) => console.warn(`[judge] ${message}`, extra ?? "") }),
    prompts: loadPromptsSync(config.PROMPTS_DIR),
    models: {
      tutor: config.TUTOR_MODEL,
      thinking: config.TUTOR_THINKING === "default" ? undefined : { type: config.TUTOR_THINKING },
      effort: config.TUTOR_EFFORT === "default" ? undefined : config.TUTOR_EFFORT,
    },
  });
}

const repoRoot = (rel: string) => path.resolve(import.meta.dirname, "../../..", rel);

export function createContainer(config: Config, allOverrides: ContainerOverrides = {}): Container {
  const { writer, sequenceLlm, now, log, retryDelayMs, exerciseGenerator, ...overrides } = allOverrides;

  // ---- Whiteboard (Person 3) ----
  const tts = "tts" in overrides ? (overrides.tts ?? null) : buildTts(config);
  const dbReady = overrides.dbReady ?? isMongoUp;
  const store = overrides.chunkStore ?? new MongoChunkStore();
  const embed = "embed" in overrides ? (overrides.embed ?? null) : config.VOYAGE_API_KEY ? embedWithVoyage({ apiKey: config.VOYAGE_API_KEY }) : null;
  const mongoRepo = new MongoTurnRepository(store);
  const repo = overrides.repo ?? mongoRepo;
  const images = overrides.images ?? new ImageStore(join(config.DATA_DIR, "files", "gen"));
  const evidence = overrides.evidence ?? new MongoEvidenceStore();
  const history = overrides.history ?? mongoRepo;
  const retriever = overrides.retriever ?? (embed ? createRetriever({ store, embed, isAvailable: dbReady }) : emptyRetriever);
  const engine = "engine" in overrides ? (overrides.engine ?? null) : buildEngine(config, repo, tts, images, evidence, retriever);
  const subjects = overrides.subjects ?? new MongoSubjectStore();

  // ---- Teacher side (Person 1) ----
  const baseRepo = overrides.teacherRepo ?? new MongoRepository();
  // The analysis reads what the tutor stored in MongoDB. A JSON file is only a dev/demo option (CONVERSATIONS_FILE).
  const allConversations =
    overrides.conversations ??
    (config.CONVERSATIONS_FILE ? new FileConversationSource(config.CONVERSATIONS_FILE, idMapsFromRepo(baseRepo)) : new MongoConversationSource(baseRepo, new MongoConversationReader()));
  // The teacher follows one subject (D78): everything the teacher side reads, the analysis included, goes through this scope.
  const scope = new SubjectScope({ key: config.TEACHER_SUBJECT_KEY, subjects, conversations: allConversations });
  const teacherRepo = scope.repo(baseRepo);
  const conversations = scope.conversations();
  const fileStore = overrides.fileStore ?? new DiskFileStore(config.UPLOAD_DIR ? path.resolve(config.UPLOAD_DIR) : repoRoot("data/uploads"));
  const bus = overrides.bus ?? new TeacherBus();
  const analysis = overrides.analysis ?? new AnalysisService({ repo: teacherRepo, conversations, writer, now, emit: bus.emit, log });
  const sessionEnded =
    overrides.sessionEnded ??
    new SessionEndedHandler(analysis, {
      retryDelayMs: retryDelayMs ?? 30_000,
      log,
      maxWaitMs: config.ANALYSIS_MAX_WAIT_MS,
      // Only conversations of the teacher's subject (the scoped source returns null for the others) and of students
      // registered by the teacher are analysed (a stray student id would pollute the teacher's numbers).
      shouldAnalyze: async (id) => {
        const bundle = await conversations.getSessionBundle(id);
        return !!bundle && !!(await teacherRepo.getStudent(bundle.session.student_id));
      },
      // The judge records evidence in the background after each answer: wait until every answer has been judged.
      isSettled: async (id) => {
        const bundle = await conversations.getSessionBundle(id);
        if (!bundle) return true;
        const answered = bundle.events.filter((e) => e.type === "verification_answered").length;
        return bundle.events.filter((e) => e.type === "evidence_recorded").length >= answered;
      },
    });
  const ingest =
    overrides.ingest ??
    new MaterialIngestQueue({
      repo: teacherRepo,
      chunks: store,
      files: fileStore,
      embed: embed ?? (async () => Promise.reject(new Error("VOYAGE_API_KEY is not set"))),
      llm: sequenceLlm,
      onStatus: (m) => bus.emit({ type: "material_status", material_id: m.id, status: m.status, progress: m.progress }),
      log,
    });

  const exerciseLists = overrides.exerciseLists ?? new MongoExerciseListStore();
  const generator =
    exerciseGenerator !== undefined ? exerciseGenerator : config.ANTHROPIC_API_KEY ? new ClaudeExerciseGenerator({ apiKey: config.ANTHROPIC_API_KEY, model: config.EXERCISES_MODEL }) : null;
  const exercises =
    overrides.exercises ?? new ExerciseListService({ lists: exerciseLists, repo: teacherRepo, conversations, chunks: store, generator, emit: bus.emit, log });

  return {
    config,
    mongo: new MongoService(config.MONGODB_URI, config.MONGODB_DB),
    mintSttToken,
    ...overrides,
    tts, repo, images, evidence, history, retriever, chunkStore: store, embed, subjects, dbReady, engine,
    teacherRepo, conversations, analysis, sessionEnded, bus, fileStore, ingest, exerciseLists, exercises,
  };
}
