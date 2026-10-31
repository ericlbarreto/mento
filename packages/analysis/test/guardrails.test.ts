import { describe, expect, it } from "vitest";
import type { WriterOutput } from "@mento/contracts";
import { LlmWriter, loadAnalysisPrompt, buildLlmPayload, composeInsights, computeFindings, containsSensitive, templateWrite } from "../src";
import { ev, input, sess } from "./helpers";

const C = "Formas de governo";
const KEY = "formas de governo";

function setup() {
  const e1 = ev(C, "incorrect", { lesson: "L2", answer: "na república o rei é eleito" });
  const e2 = ev(C, "incorrect", { lesson: "L2", answer: "ele virou o presidente da república" });
  const inp = input([sess("s1", [e1]), sess("s2", [e2])], { studying: "L6" });
  const findings = computeFindings(inp);
  const template = templateWrite(inp, findings);
  const llmItem = (over: Partial<WriterOutput["insights"][number]> = {}): WriterOutput["insights"][number] => ({
    concept_key: KEY, rule: "R3_recurring", severity: "critical", title: "Título do modelo", body: "Texto do modelo sobre a dúvida.",
    evidence: [{ event_id: e1.answer_event_id!, quote: "o rei é eleito" }],
    suggestion: { title: "Sugestão do modelo", body: "Fazer a atividade 2.2.", material_ref: { lesson_id: "L2", pages: [20, 25] } },
    ...over,
  });
  const llm = (items: WriterOutput["insights"], summary = "Resumo do modelo."): WriterOutput => ({ summary, insights: items });
  return { inp, findings, template, llmItem, llm, e1, e2 };
}

describe("the LLM cannot change the verdict (BR-06)", () => {
  it("BR-06 a valid draft is used as written and marked source=llm", () => {
    const s = setup();
    const out = composeInsights({ input: s.inp, findings: s.findings, template: s.template, llm: s.llm([s.llmItem()]) });
    expect(out.insights[0]).toMatchObject({ title: "Título do modelo", source: "llm" });
    expect(out.summary).toBe("Resumo do modelo.");
    expect(out.rejections).toEqual([]);
  });

  it.each([
    ["other severity", { severity: "positive" as const }, "severity_mismatch"],
    ["other rule", { rule: "M1_single_error" as const }, "rule_mismatch"],
    ["confidence above the formula", { confidence: 0.99 }, "confidence_above_formula"],
    ["empty text", { title: "  " }, "empty_text"],
  ])("BR-06 %s → item dropped, the template is used", (_n, over, reason) => {
    const s = setup();
    const out = composeInsights({ input: s.inp, findings: s.findings, template: s.template, llm: s.llm([s.llmItem(over)]) });
    expect(out.rejections).toContainEqual({ concept_key: KEY, reason });
    expect(out.insights[0]).toMatchObject({ source: "template", title: s.template.insights[0]!.title });
    expect(out.insights[0]!.finding.severity).toBe("critical");
  });

  it("BR-06 an invented concept is rejected and creates no insight", () => {
    const s = setup();
    const out = composeInsights({ input: s.inp, findings: s.findings, template: s.template, llm: s.llm([s.llmItem(), s.llmItem({ concept_key: "inventado" })]) });
    expect(out.rejections).toContainEqual({ concept_key: "inventado", reason: "unknown_concept" });
    expect(out.insights).toHaveLength(s.findings.length);
  });

  it("BR-06 a duplicate item for the same concept is ignored", () => {
    const s = setup();
    const out = composeInsights({ input: s.inp, findings: s.findings, template: s.template, llm: s.llm([s.llmItem(), s.llmItem({ title: "outro" })]) });
    expect(out.rejections).toContainEqual({ concept_key: KEY, reason: "duplicate" });
    expect(out.insights[0]!.title).toBe("Título do modelo");
  });

  it("BR-06 outside_material is accepted only when the graph found no prerequisite", () => {
    const s = setup();
    const refined = composeInsights({ input: s.inp, findings: s.findings, template: s.template, llm: s.llm([s.llmItem({ diagnosis: "outside_material" })]) });
    // the lesson graph found a prerequisite (L2 before L6), so the model cannot override it
    expect(refined.insights[0]!.diagnosis).toBe("prerequisite");

    const e = ev("Mapas", "partial", { lesson: "L5", answer: "perto da grécia?" });
    const inp = input([sess("s1", [e])], { studying: "L5" });
    const findings = computeFindings(inp);
    const template = templateWrite(inp, findings);
    expect(findings[0]!.diagnosis).toBe("current_topic");
    const item = { concept_key: "mapas", rule: findings[0]!.rule, severity: findings[0]!.severity, title: "t", body: "b", diagnosis: "outside_material" as const, reasoning: "Leitura de mapa não é ensinada na apostila." };
    const out = composeInsights({ input: inp, findings, template, llm: { summary: "ok", insights: [item] } });
    expect(out.insights[0]).toMatchObject({ diagnosis: "outside_material", reasoning: "Leitura de mapa não é ensinada na apostila." });
  });
});

describe("quotes are real (BR-07)", () => {
  it("BR-07 an exact substring of the student's turn is kept", () => {
    const s = setup();
    const out = composeInsights({ input: s.inp, findings: s.findings, template: s.template, llm: s.llm([s.llmItem()]) });
    expect(out.insights[0]!.evidence).toEqual([{ event_id: s.e1.answer_event_id, quote: "o rei é eleito" }]);
  });

  it("BR-07 a quote that is not in the turn is dropped (all dropped → template evidence)", () => {
    const s = setup();
    const out = composeInsights({ input: s.inp, findings: s.findings, template: s.template, llm: s.llm([s.llmItem({ evidence: [{ event_id: s.e1.answer_event_id!, quote: "frase inventada" }] })]) });
    expect(out.rejections).toContainEqual({ concept_key: KEY, reason: `quote_not_found:${s.e1.answer_event_id}` });
    expect(out.insights[0]!.evidence).toEqual(s.template.insights[0]!.evidence);
    expect(out.insights[0]!.source).toBe("llm");
  });

  it("BR-07 a quote taken from a tutor turn, or an unknown event id, is dropped", () => {
    const s = setup();
    s.inp.sessions[1]!.turns.push({ event_id: "tutor1", role: "tutor", text: "Na República não havia rei." });
    const out = composeInsights({
      input: s.inp, findings: s.findings, template: s.template,
      llm: s.llm([s.llmItem({ evidence: [{ event_id: "tutor1", quote: "Na República não havia rei." }, { event_id: "nope", quote: "x" }, { event_id: s.e2.answer_event_id!, quote: "presidente da república" }] })]),
    });
    expect(out.insights[0]!.evidence).toEqual([{ event_id: s.e2.answer_event_id, quote: "presidente da república" }]);
    expect(out.rejections.filter((r) => r.reason.startsWith("quote_not_found"))).toHaveLength(2);
  });
});

describe("every finding becomes an insight, every gap has a suggestion (BR-08)", () => {
  it("BR-08 a gap without suggestion from the LLM receives the template suggestion", () => {
    const s = setup();
    const out = composeInsights({ input: s.inp, findings: s.findings, template: s.template, llm: s.llm([s.llmItem({ suggestion: null })]) });
    expect(out.insights[0]!.suggestion).toEqual(s.template.insights[0]!.suggestion);
    expect(out.insights[0]!.suggestion?.title).toBeTruthy();
  });

  it("BR-08 the LLM omits a finding → the template insight is created for it", () => {
    const inp = input([sess("s1", [ev(C, "incorrect", { lesson: "L2" }), ev("Crise", "correct", { lesson: "L6" })])], { studying: "L6" });
    const findings = computeFindings(inp);
    const template = templateWrite(inp, findings);
    const out = composeInsights({ input: inp, findings, template, llm: { summary: "ok", insights: [] } });
    expect(out.insights.map((i) => i.finding.concept_key)).toEqual(findings.map((f) => f.concept_key));
    expect(out.insights.every((i) => i.source === "template")).toBe(true);
  });

  it("BR-08 progress insights carry no suggestion, gaps always do", () => {
    const inp = input([sess("s1", [ev(C, "incorrect", { lesson: "L2" }), ev("Crise", "correct", { lesson: "L6" })])], { studying: "L6" });
    const findings = computeFindings(inp);
    const out = composeInsights({ input: inp, findings, template: templateWrite(inp, findings) });
    for (const i of out.insights) expect(i.suggestion === null).toBe(i.finding.kind === "progress");
  });
});

describe("no sensitive inferences (BR-15)", () => {
  it.each(["Aluno ansioso", "é preguiçoso", "parece desatento", "tem estilo de aprendizagem visual", "muito inteligente", "possível TDAH", "tem falta de atenção", "perfil tímido", "é lento", "tem depressão"])(
    "BR-15 flags %s",
    (text) => expect(containsSensitive(text)).toBe(true),
  );

  it("BR-15 does not flag ordinary pedagogical text", () => {
    expect(containsSensitive("Retomar a atividade 2.2 sobre formas de governo")).toBe(false);
    expect(containsSensitive("Pontos de atenção: Formas de governo.")).toBe(false);
    expect(containsSensitive("Treinar a leitura do mapa do Mediterrâneo lentamente")).toBe(false);
  });

  it("BR-15 an LLM draft with sensitive language is rejected, and so is a sensitive summary", () => {
    const s = setup();
    const out = composeInsights({ input: s.inp, findings: s.findings, template: s.template, llm: s.llm([s.llmItem({ body: "Parece um aluno ansioso." })], "Aluno desatento.") });
    expect(out.rejections).toContainEqual({ concept_key: KEY, reason: "sensitive_language" });
    expect(out.rejections).toContainEqual({ concept_key: "*", reason: "summary_rejected" });
    expect(out.summary).toBe(s.template.summary);
  });

  it("BR-15 every deterministic template text is free of sensitive language", () => {
    const cases = [
      [ev(C, "incorrect", { lesson: "L2" }), ev(C, "incorrect", { lesson: "L2" })],
      [ev(C, "partial", { lesson: "L6" })],
      [ev(C, "correct", { hints: 2, lesson: "L7" })],
      [ev(C, "correct", { lesson: "L7" }), ev(C, "correct", { lesson: "L7" })],
      [ev(C, "correct", { lesson: "L7" })],
    ];
    for (const rows of cases) {
      for (const studying of ["L2", "L6", "L7", null]) {
        const inp = input([sess("s1", rows)], { studying });
        const t = templateWrite(inp, computeFindings(inp));
        const all = [t.summary, ...t.insights.flatMap((i) => [i.title, i.body, i.reasoning ?? "", i.suggestion?.title ?? "", i.suggestion?.body ?? ""])];
        for (const text of all) expect(containsSensitive(text), text).toBe(false);
      }
    }
  });
});

describe("the analysis prompt (BR-06)", () => {
  it("BR-06 prompts/analysis.md tells the model the rules the guardrails enforce", () => {
    const prompt = loadAnalysisPrompt();
    for (const rule of ["Copy `concept_key`, `rule` and `severity`", "verbatim", "outside_material", "Never describe the student's personality", "Do not guess the student's gender"]) {
      expect(prompt, rule).toContain(rule);
    }
  });
});

describe("LLM request and privacy (BR-14)", () => {
  it("BR-14 the payload sent to the model has no name, profile or school history", () => {
    const s = setup();
    const payload = JSON.stringify(buildLlmPayload(s.inp, s.findings));
    for (const forbidden of ["Ana Souza", "profile", "guardian", "school_history", "enrollment", "student_id", "stu-test"]) expect(payload).not.toContain(forbidden);
    expect(payload).toContain("o rei é eleito");
  });

  it("BR-14 LlmWriter parses JSON wrapped in a code fence and rejects malformed output", async () => {
    const s = setup();
    const good = new LlmWriter({ id: "fake", prompt_version: "v0", systemPrompt: "sys", complete: async () => "```json\n" + JSON.stringify(s.llm([s.llmItem()])) + "\n```" });
    expect((await good.write(s.inp, s.findings)).insights).toHaveLength(1);
    const bad = new LlmWriter({ id: "fake", prompt_version: "v0", systemPrompt: "sys", complete: async () => "não é json" });
    await expect(bad.write(s.inp, s.findings)).rejects.toThrow();
  });
});
