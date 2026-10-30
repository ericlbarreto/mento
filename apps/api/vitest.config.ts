import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // @fastify/autoload loads routes with native import(): register tsx so Node can load workspace TS source.
    pool: "forks",
    execArgv: ["--import", "tsx"],
  },
});
