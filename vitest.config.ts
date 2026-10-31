import { defineConfig } from "vitest/config";

// One project per package, each with its own root: tests behave the same as `pnpm --filter <pkg> test`.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/api", "scripts"],
    passWithNoTests: true,
  },
});
