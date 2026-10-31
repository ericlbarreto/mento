import { z } from "zod";
import { Citation, type Retriever } from "@mento/contracts";
import type { Judge, JudgeInput } from "../hooks";
import type { LlmClient } from "../llm";
import type { TurnRepository } from "../repository";
import type { ToolDef } from "../tools";
import type { EvidenceStore } from "./evidence";

export const JudgmentSchema = z.object({
  result: z.enum(["correct", "partial", "incorrect"]),
  rationale: z.string().min(1).max(300),
  citation: Citation.optional(),
});

const JUDGMENT_TOOL: ToolDef = {
  name: "record_judgment",
  description:
    "Record your judgment of the student's answer. result: correct (fully right), partial (right in part or imprecise), incorrect. rationale: one or two sentences in Brazilian Portuguese about what the answer shows, about the answer only. citation: optional, a short exact quote from the passages that supports the judgment.",
  input_schema: {
    type: "object",
    properties: {
      result: { type: "string", enum: ["correct", "partial", "incorrect"] },
      rationale: { type: "string", maxLength: 300 },
      citation: {
        type: "object",
        properties: { material_id: { type: "string" }, page: { type: "integer" }, quote: { type: "string" } },
        required: ["material_id", "page", "quote"],
      },
    },
    required: ["result", "rationale"],
  },
};

const SYSTEM = [
  {
    type: "text" as const,
    text: "You are a strict but fair grader of short answers from students in Brazilian schools (7º to 9º ano). Judge only what the student wrote against the question and the teacher's passages. Never infer anything about the student's personality, attention or emotions. Always call record_judgment.",
  },
];

export interface ClaudeJudgeDeps {
  llm: LlmClient;
  model: string;
  repo: Pick<TurnRepository, "listEvents" | "appendEvent">;
  retriever: Retriever;
  evidence: EvidenceStore;
  log?: (message: string, extra?: unknown) => void;
}

/** Judges a student's answer in the background and records evidence. Never throws. */
export class ClaudeJudge implements Judge {
  constructor(private readonly deps: ClaudeJudgeDeps) {}

  async start(input: JudgeInput): Promise<void> {
    const { llm, model, repo, retriever, evidence, log } = this.deps;
    try {
      const events = await repo.listEvents(input.session_id);
      const askedAt = events.findIndex((e) => e.type === "verification_asked" && (e.payload as { verification_id?: string })?.verification_id === input.verification_id);
      if (askedAt < 0) return log?.("judge: question not found", input.verification_id);
      const asked = events[askedAt]!.payload as { concept: string; concept_key: string; question: string };

      let answeredAt = events.findIndex((e, i) => i > askedAt && e.type === "verification_answered" && (e.payload as { verification_id?: string })?.verification_id === input.verification_id);
      if (answeredAt < 0) answeredAt = events.length;
      const hints_used = events.slice(askedAt + 1, answeredAt).filter((e) => e.type === "hint_given" && (e.payload as { verification_id?: string })?.verification_id === input.verification_id).length;

      const passages = await retriever.searchChunks({ query: `${asked.concept} ${asked.question}`, k: 3 });
      const prompt = [
        `Question: ${asked.question}`,
        `Concept: ${asked.concept}`,
        `Student answer: ${input.answer}`,
        `Hints given before the answer: ${hints_used}`,
        "Passages from the teacher's materials:",
        passages.length ? passages.map((p) => `[${p.material_id} · p.${p.page}] ${p.text}`).join("\n") : "(none)",
      ].join("\n");

      let raw: string | undefined;
      for await (const ev of llm.stream({ model, system: SYSTEM, tools: [JUDGMENT_TOOL], tool_choice: { type: "tool", name: "record_judgment" }, messages: [{ role: "user", content: prompt }], max_tokens: 400 })) {
        if (ev.type === "tool_block" && ev.block.name === "record_judgment") raw = ev.block.raw_input;
      }
      if (!raw) return log?.("judge: the model did not call record_judgment");
      const parsed = JudgmentSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return log?.("judge: invalid judgment", parsed.error.issues[0]);
      const judgment = parsed.data;

      const citation = judgment.citation && (await retriever.validateCitation(judgment.citation)) ? judgment.citation : undefined;
      const independent = hints_used === 0;
      const row = {
        session_id: input.session_id,
        student_id: input.student_id,
        concept: asked.concept,
        concept_key: asked.concept_key,
        result: judgment.result,
        independent,
        hints_used,
        rationale: judgment.rationale,
        citation,
      };
      const { id } = await evidence.insertEvidence(row);
      await repo.appendEvent(input.session_id, {
        type: "evidence_recorded",
        payload: { evidence_id: id, verification_id: input.verification_id, concept: asked.concept, concept_key: asked.concept_key, result: judgment.result, independent, hints_used, rationale: judgment.rationale, citation },
      });
    } catch (err) {
      log?.("judge failed", err);
    }
  }
}
