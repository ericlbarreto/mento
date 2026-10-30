import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// Server-only packages: never imported from client code (docs/21-repo-structure.md, rule 1).
const serverOnly = ["@mento/db", "@mento/sources", "@mento/tutor", "@mento/analysis", "@mento/voice/server"];
const clientBoundary = {
  "no-restricted-imports": [
    "error",
    {
      paths: serverOnly.map((name) => ({
        name,
        message: "Client code must not import server packages. Call the API instead (docs/21 §4).",
      })),
    },
  ],
};

export default defineConfig([
  globalIgnores(["**/node_modules/**", "**/.next/**", "**/dist/**", "**/coverage/**", "data/**", "assets/**", "materials/**"]),
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  { files: ["apps/web/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}", "packages/board/**/*.{ts,tsx}"], rules: clientBoundary },
]);
