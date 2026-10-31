import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load the repo-root .env (git-ignored) when present. Packages never read env; only this file does.
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // no .env: defaults apply
}

const schema = z.object({
  API_PORT: z.coerce.number().int().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  MONGODB_URI: z.string().default("mongodb://localhost:27017/mento"),
  /** Optional. Without it the database named in MONGODB_URI is used (`test` when an Atlas URI names none): the same one the whiteboard ingestion script writes to. */
  MONGODB_DB: z.string().optional(),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.string().default("info"),
  DEMO_MODE: z.enum(["live", "fixture"]).default("live"),
  DATA_DIR: z.string().default(fileURLToPath(new URL("../../../data", import.meta.url))),
  DEEPGRAM_API_KEY: z.string().default(""),
  ELEVENLABS_API_KEY: z.string().default(""),
  ELEVENLABS_VOICE_ID: z.string().default(""),
  ELEVENLABS_MODEL: z.string().default("eleven_flash_v2_5"),
  TTS_MODE: z.enum(["http", "ws"]).default("ws"),
  ANTHROPIC_API_KEY: z.string().default(""),
  // Haiku 5.5 without thinking: ~1.3 s to the first action vs ~5 s for Sonnet 5.5 defaults (research doc 2026-10-30).
  TUTOR_MODEL: z.string().default("claude-haiku-5-5"),
  TUTOR_THINKING: z.enum(["adaptive", "between_tools", "disabled", "default"]).default("disabled"),
  TUTOR_EFFORT: z.enum(["low", "medium", "high", "default"]).default("default"),
  JUDGE_MODEL: z.string().default("claude-haiku-5-5"),
  /** Writes the exercise lists for the teacher (D72): quality matters more than latency here. */
  EXERCISES_MODEL: z.string().default("claude-opus-5-5"),
  GEMINI_API_KEY: z.string().default(""),
  IMAGE_MODEL: z.string().default("gemini-3.1-flash-lite-image"),
  VOYAGE_API_KEY: z.string().default(""),
  PROMPTS_DIR: z.string().default(fileURLToPath(new URL("../../../prompts", import.meta.url))),
  /** Dev/demo only: read the conversations from this JSON file (e.g. fixtures/analysis-lab/conversations.json) instead of MongoDB. */
  CONVERSATIONS_FILE: z.string().optional(),
  /** How long (ms) the analysis waits after a conversation ends for the judge to finish before running anyway. */
  ANALYSIS_MAX_WAIT_MS: z.coerce.number().int().min(0).default(15_000),
  /** The one subject the teacher follows (D78): other subjects and the free whiteboard stay out of the teacher side. */
  TEACHER_SUBJECT_KEY: z.string().default("history"),
  /** Where uploaded PDFs are stored. Default: data/uploads at the repo root (git-ignored). */
  UPLOAD_DIR: z.string().optional(),
  UPLOAD_MAX_MB: z.coerce.number().positive().default(200),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}
