import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { readFileSync } from "node:fs";
import * as z from "zod/v4";

/** What the generator sees: the topic and the book, never a student (D72). */
export interface ExerciseSource {
  concept: string;
  grade_level: string;
  class_description: string;
  lesson: { title: string; summary?: string; key_concepts?: string[] } | null;
  passages: { page: number; text: string }[];
}

const Question = z.object({
  kind: z.enum(["choice", "open"]),
  prompt: z.string(),
  options: z.array(z.string()).nullable(),
  answer: z.string(),
  explanation: z.string(),
  page: z.number().int().nullable(),
});

export const GeneratedList = z.object({ title: z.string(), questions: z.array(Question) });
export type GeneratedList = z.infer<typeof GeneratedList>;

export interface ExerciseGenerator {
  readonly model: string;
  generate(source: ExerciseSource): Promise<GeneratedList>;
}

export const EXERCISES_PROMPT_VERSION = "exercises-v1";

/** Loads `prompts/exercises.md` (prompts are editable text files, not code). */
export function loadExercisesPrompt(path = new URL("../../../../prompts/exercises.md", import.meta.url)): string {
  return readFileSync(path, "utf8");
}

/** What goes to the model, as one user message (stable instructions live in the system prompt). */
export function renderSource(s: ExerciseSource): string {
  const lesson = s.lesson
    ? [`Lesson: ${s.lesson.title}`, s.lesson.summary ? `Summary: ${s.lesson.summary}` : "", s.lesson.key_concepts?.length ? `Key concepts: ${s.lesson.key_concepts.join("; ")}` : ""]
        .filter(Boolean)
        .join("\n")
    : "Lesson: (the book has no lesson for this topic)";
  const passages = s.passages.length ? s.passages.map((p) => `[página ${p.page}]\n${p.text}`).join("\n\n") : "(no passages: the book was not uploaded or has no text for these pages)";
  return [
    `Topic: ${s.concept}`,
    `Grade level: ${s.grade_level}`,
    `Class: ${s.class_description || "(no description)"}`,
    lesson,
    `Passages:\n${passages}`,
  ].join("\n\n");
}

/** Exactly 3 choice questions with 4 options (answer among them) and 2 open ones. */
export function checkList(list: GeneratedList): string | null {
  const choice = list.questions.filter((q) => q.kind === "choice");
  const open = list.questions.filter((q) => q.kind === "open");
  if (choice.length !== 3 || open.length !== 2) return `expected 3 choice and 2 open questions, got ${choice.length} and ${open.length}`;
  for (const q of choice) {
    if (q.options?.length !== 4) return "a choice question must have 4 options";
    if (!q.options.includes(q.answer)) return "the answer of a choice question must be one of its options";
  }
  return null;
}

/** Claude writes the list; the SDK validates the JSON against the schema (structured outputs). */
export class ClaudeExerciseGenerator implements ExerciseGenerator {
  private readonly client: Anthropic;
  private readonly system: string;

  constructor(opts: { apiKey: string; model: string; prompt?: string }) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model;
    this.system = opts.prompt ?? loadExercisesPrompt();
  }

  readonly model: string;

  async generate(source: ExerciseSource): Promise<GeneratedList> {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      // On a policy decline the API re-runs the request on a fallback model chosen by the refusal category.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: this.system,
      output_config: { effort: "medium", format: betaZodOutputFormat(GeneratedList) },
      messages: [{ role: "user", content: renderSource(source) }],
    });
    if (response.stop_reason === "refusal") throw new Error("the model declined to write the list");
    if (response.stop_reason === "max_tokens") throw new Error("the list was cut off (max_tokens)");
    const list = response.parsed_output;
    if (!list) throw new Error("the model returned no list");
    return list;
  }
}
