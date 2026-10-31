import { describe, expect, it } from "vitest";
import type { Chunk, Retriever } from "@mento/contracts";
import { InMemoryTurnRepository, ScriptedLlm, stopEvent, toolEvent } from "../testing";
import { InMemoryEvidenceStore } from "./evidence";
import { ClaudeJudge } from "./claude-judge";

const passage: Chunk = { id: "c1", material_id: "m1", subject: "history", page: 12, passage_idx: 0, text: "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto." };
const retriever: Retriever = { searchChunks: async () => [passage], validateCitation: async () => true };

async function setup(llm: ScriptedLlm, hints = 2) {
  const repo = new InMemoryTurnRepository();
  const { id: session_id } = await repo.createSession({ student_id: "stu_1", modality: "text" });
  await repo.appendEvent(session_id, { type: "verification_asked", payload: { verification_id: "ver_1", element_id: "q1", concept: "Fim da República", concept_key: "fim da republica", question: "O que mudou depois de 27 a.C.?", kind: "explain" } });
  for (let level = 1; level <= hints; level++) await repo.appendEvent(session_id, { type: "hint_given", payload: { turn_id: "turn_1", level, verification_id: "ver_1", concept_key: "fim da republica" } });
  await repo.appendEvent(session_id, { type: "hint_given", payload: { turn_id: "turn_1", level: 1, verification_id: "ver_OTHER" } });
  await repo.appendEvent(session_id, { type: "verification_answered", payload: { verification_id: "ver_1", element_id: "q1", answer: "Roma passou a ter um imperador" } });
  const evidence = new InMemoryEvidenceStore();
  const judge = new ClaudeJudge({ llm, model: "judge-model", repo, retriever, evidence });
  return { repo, session_id, evidence, judge, llm };
}
const input = (session_id: string) => ({ session_id, student_id: "stu_1", verification_id: "ver_1", element_id: "q1", answer: "Roma passou a ter um imperador" });

describe("ClaudeJudge", () => {
  it("asks the judge model for a forced judgment, then stores evidence with hints counted from the events", async () => {
    const llm = new ScriptedLlm([[toolEvent("record_judgment", { result: "partial", rationale: "Citou o imperador, mas não explicou o Senado.", citation: { material_id: "m1", page: 12, quote: "o Senado concedeu a Otávio o título de Augusto" } }), stopEvent("tool_use")]]);
    const { judge, session_id, evidence, repo } = await setup(llm);
    await judge.start(input(session_id));

    const req = llm.calls[0]!;
    expect(req.model).toBe("judge-model");
    expect(req.tool_choice).toEqual({ type: "tool", name: "record_judgment" });
    expect(req.tools.map((t) => t.name)).toEqual(["record_judgment"]);
    const prompt = JSON.stringify(req.messages);
    expect(prompt).toContain("O que mudou depois de 27 a.C.?");
    expect(prompt).toContain("Roma passou a ter um imperador");
    expect(prompt).toContain("o Senado concedeu a Otávio");

    expect(evidence.items).toEqual([
      {
        session_id, student_id: "stu_1", concept: "Fim da República", concept_key: "fim da republica",
        result: "partial", independent: false, hints_used: 2,
        rationale: "Citou o imperador, mas não explicou o Senado.",
        citation: { material_id: "m1", page: 12, quote: "o Senado concedeu a Otávio o título de Augusto" },
      },
    ]);
    const recorded = (await repo.listEvents(session_id)).find((e) => e.type === "evidence_recorded");
    expect(recorded?.payload).toMatchObject({ verification_id: "ver_1", concept_key: "fim da republica", result: "partial", independent: false, hints_used: 2 });
  });

  it("marks a correct answer without hints as independent, and drops a citation the retriever rejects", async () => {
    const llm = new ScriptedLlm([[toolEvent("record_judgment", { result: "correct", rationale: "Explicou bem.", citation: { material_id: "m1", page: 1, quote: "inventada" } }), stopEvent("tool_use")]]);
    const { repo, session_id, evidence } = await setup(llm, 0);
    const rejecting = new ClaudeJudge({ llm, model: "j", repo, retriever: { searchChunks: async () => [], validateCitation: async () => false }, evidence });
    await rejecting.start(input(session_id));
    expect(evidence.items).toHaveLength(1);
    expect(evidence.items[0]).toMatchObject({ result: "correct", independent: true, hints_used: 0 });
    expect(evidence.items[0]?.citation).toBeUndefined();
  });

  it("keeps the judgment when the rationale is too long (clipped) or the citation is malformed (dropped)", async () => {
    const long = "A resposta confunde o Dia do Fico com a Proclamação da República e diz que D. Pedro voltou para Portugal. ".repeat(4);
    const llm = new ScriptedLlm([[toolEvent("record_judgment", { result: "incorrect", rationale: long, citation: { page: "x" } }), stopEvent("tool_use")]]);
    const { judge, evidence, session_id } = await setup(llm);
    await judge.start(input(session_id));
    expect(evidence.items).toHaveLength(1);
    const row = evidence.items[0]!;
    expect(row.result).toBe("incorrect");
    expect(row.rationale.length).toBeLessThanOrEqual(300);
    expect(row.rationale.endsWith("…")).toBe(true);
    expect(row.citation).toBeUndefined();
  });

  it("stores nothing for an invalid judgment, a missing question or an LLM failure", async () => {
    const bad = new ScriptedLlm([[toolEvent("record_judgment", { result: "great" }), stopEvent("tool_use")]]);
    const a = await setup(bad);
    await a.judge.start(input(a.session_id));
    expect(a.evidence.items).toEqual([]);

    const ok = new ScriptedLlm([[toolEvent("record_judgment", { result: "correct", rationale: "ok" }), stopEvent("tool_use")]]);
    const b = await setup(ok);
    await b.judge.start({ ...input(b.session_id), verification_id: "ver_unknown" });
    expect(b.evidence.items).toEqual([]);
    expect(ok.calls).toHaveLength(0);

    const none = new ScriptedLlm([[stopEvent()]]);
    const c = await setup(none);
    await c.judge.start(input(c.session_id));
    expect(c.evidence.items).toEqual([]);
  });

  it("records no evidence when the student did not try to answer (a board request, another topic)", async () => {
    const llm = new ScriptedLlm([[toolEvent("record_judgment", { result: "not_an_answer", rationale: "Pediu para mover um bloco." }), stopEvent("tool_use")]]);
    const { judge, session_id, evidence, repo } = await setup(llm);
    await judge.start(input(session_id));
    expect(evidence.items).toEqual([]);
    expect((await repo.listEvents(session_id)).some((e) => e.type === "evidence_recorded")).toBe(false);
  });
});
