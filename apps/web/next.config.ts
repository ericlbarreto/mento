import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "node:path";

const repoRoot = path.join(import.meta.dirname, "../..");
loadEnvConfig(repoRoot); // one .env at the repo root

const config: NextConfig = {
  // Client-side workspace packages ship TypeScript source.
  transpilePackages: ["@mento/contracts", "@mento/ui", "@mento/board", "@mento/voice"],
  turbopack: { root: repoRoot },
};

export default config;
