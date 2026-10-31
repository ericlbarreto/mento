import { readFileSync } from "node:fs";
import { WriterOutput, type AnalysisInput, type Finding } from "@mento/contracts";

/** Optional LLM that only rewrites the text of findings the rules already fixed. */
export interface AnalysisWriter {
  /** Stored in `analyses.writer` and part of the input hash. */
  id: string;
  prompt_version: string;
  write(input: AnalysisInput, findings: Finding[]): Promise<WriterOutput>;
}

export interface LlmRequest {
  system: string;
  user: string;
}

export interface LlmWriterOptions {
  /** Provider call (temperature 0, JSON output). Injected so the provider (Q4) stays a one-line change. */
  complete: (request: LlmRequest) => Promise<string>;
  systemPrompt: string;
  id: string;
  prompt_version: string;
}

/** Loads `prompts/analysis.md` (prompts are editable text files, not code). */
export function loadAnalysisPrompt(path = new URL("../../../prompts/analysis.md", import.meta.url)): string {
  return readFileSync(path, "utf8");
}

/** What the model sees: concepts, answers and lessons only. No name, no profile, no school history (BR-14). */
export function buildLlmPayload(input: AnalysisInput, findings: Finding[]) {
  return {
    class_context: input.class_context,
    studying_lesson_id: input.studying_lesson_id,
    material: {
      title: input.material.title,
      subject: input.material.subject,
      lessons: input.material.sequence.map((l) => ({
        lesson_id: l.lesson_id, order: l.order, title: l.title, pages: l.pages, taught_in_class: l.taught_in_class,
        summary: l.summary, activities: l.activities, prerequisites: l.prerequisites,
      })),
    },
    findings: findings.map((f) => ({
      concept: f.concept, concept_key: f.concept_key, rule: f.rule, severity: f.severity, confidence: f.confidence,
      diagnosis: f.diagnosis, root_cause: f.root_cause, metrics: f.metrics, evidence: f.evidence,
    })),
    turns: input.sessions.flatMap((s) => s.turns.map((t) => ({ session_id: s.session_id, ...t }))),
  };
}

const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

export class LlmWriter implements AnalysisWriter {
  readonly id: string;
  readonly prompt_version: string;

  constructor(private readonly options: LlmWriterOptions) {
    this.id = options.id;
    this.prompt_version = options.prompt_version;
  }

  async write(input: AnalysisInput, findings: Finding[]): Promise<WriterOutput> {
    const raw = await this.options.complete({
      system: this.options.systemPrompt,
      user: JSON.stringify(buildLlmPayload(input, findings)),
    });
    const text = raw.trim();
    return WriterOutput.parse(JSON.parse(fenced.exec(text)?.[1] ?? text));
  }
}
