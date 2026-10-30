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
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}
