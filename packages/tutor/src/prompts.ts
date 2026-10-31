import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

export interface PromptSet {
  base: string;
  /** Subject profile text by subject key (file name without .md). */
  subjects: Record<string, string>;
}

/** Read `base.md` and `subjects/*.md` once at startup. */
export function loadPromptsSync(dir: string): PromptSet {
  const base = readFileSync(join(dir, "base.md"), "utf8");
  const subjectsDir = join(dir, "subjects");
  const subjects: Record<string, string> = {};
  for (const file of readdirSync(subjectsDir).filter((f) => f.endsWith(".md")).sort()) {
    subjects[basename(file, ".md")] = readFileSync(join(subjectsDir, file), "utf8");
  }
  return { base, subjects };
}
