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
  TUTOR_MODEL: z.string().default("claude-sonnet-5-5"),
  JUDGE_MODEL: z.string().default("claude-haiku-5-5"),
  GEMINI_API_KEY: z.string().default(""),
  IMAGE_MODEL: z.string().default("gemini-3.1-flash-lite-image"),
  PROMPTS_DIR: z.string().default(fileURLToPath(new URL("../../../prompts", import.meta.url))),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}
