import {
  normalizeConcept,
  type AnalysisInput,
  type Diagnosis,
  type Finding,
  type InsightEvidence,
  type MaterialRef,
  type Rejection,
  type WriterInsight,
  type WriterOutput,
} from "@mento/contracts";

/** Words that would label the student instead of describing evidence (docs/05, docs/08). Matched on accent-free lowercase. */
const SENSITIVE = [
  /\bansios/, /\bpreguic/, /\bdesatent/, /\b(falta|deficit|problemas?|dificuldade) (de|na|em) atencao/, /\bdistrai/, /\bdesmotiv/, /\binteligen/, /\bburr[oa]/,
  /\bestilos? de aprendizagem/, /\btimid/, /\bhiperativ/, /\btdah\b/, /\bautis/, /\bdepress/, /\bpersonalidade/, /\blent[oa]\b/,
];

export function containsSensitive(text: string): boolean {
  const norm = normalizeConcept(text);
  return SENSITIVE.some((re) => re.test(norm));
}

export interface ComposedInsight {
  finding: Finding;
  title: string;
  body: string;
  reasoning: string | null;
  diagnosis: Diagnosis | null;
  evidence: InsightEvidence[];
  suggestion: { title: string; body: string; material_ref: MaterialRef | null } | null;
  source: "llm" | "template";
}

export interface Composition {
  summary: string;
  insights: ComposedInsight[];
  rejections: Rejection[];
}

const nonEmpty = (s: string | undefined): s is string => !!s && s.trim().length > 0;

/**
 * Merges the deterministic template with an optional LLM draft. The LLM can only improve wording:
 * severity, rule, confidence and concepts come from the rules, and every item that breaks a guardrail is
 * dropped in favour of the template. Every finding becomes an insight; no insight exists without a finding.
 */
export function composeInsights(args: {
  input: AnalysisInput;
  findings: Finding[];
  template: WriterOutput;
  llm?: WriterOutput | null;
}): Composition {
  const { input, findings, template, llm } = args;
  const rejections: Rejection[] = [];
  const templateBy = new Map(template.insights.map((i) => [i.concept_key, i]));
  const findingBy = new Map(findings.map((f) => [f.concept_key, f]));

  const studentTurns = new Map<string, string>();
  for (const s of input.sessions) for (const t of s.turns) if (t.role === "student") studentTurns.set(t.event_id, t.text);

  const accepted = new Map<string, WriterInsight>();
  if (llm) {
    for (const item of llm.insights) {
      const finding = findingBy.get(item.concept_key);
      const reject = (reason: string) => rejections.push({ concept_key: item.concept_key, reason });
      if (!finding) reject("unknown_concept");
      else if (accepted.has(item.concept_key)) reject("duplicate");
      else if (item.rule !== finding.rule) reject("rule_mismatch");
      else if (item.severity !== finding.severity) reject("severity_mismatch");
      else if (item.confidence !== undefined && item.confidence > finding.confidence) reject("confidence_above_formula");
      else if (!nonEmpty(item.title) || !nonEmpty(item.body)) reject("empty_text");
      else if (containsSensitive(`${item.title} ${item.body} ${item.reasoning ?? ""}`)) reject("sensitive_language");
      else accepted.set(item.concept_key, item);
    }
  }

  const insights: ComposedInsight[] = findings.map((finding) => {
    const base = templateBy.get(finding.concept_key)!;
    const item = accepted.get(finding.concept_key);

    let evidence = base.evidence ?? [];
    if (item?.evidence) {
      const real = item.evidence.filter((e) => nonEmpty(e.quote) && studentTurns.get(e.event_id)?.includes(e.quote));
      for (const e of item.evidence) if (!real.includes(e)) rejections.push({ concept_key: item.concept_key, reason: `quote_not_found:${e.event_id}` });
      if (real.length > 0) evidence = real;
    }

    const suggestionOk =
      item?.suggestion && nonEmpty(item.suggestion.title) && nonEmpty(item.suggestion.body) && !containsSensitive(`${item.suggestion.title} ${item.suggestion.body}`);
    let suggestion: ComposedInsight["suggestion"] = null;
    if (finding.kind === "gap") {
      const t = base.suggestion!;
      suggestion = suggestionOk
        ? { title: item!.suggestion!.title, body: item!.suggestion!.body, material_ref: item!.suggestion!.material_ref ?? t.material_ref ?? null }
        : { title: t.title, body: t.body, material_ref: t.material_ref ?? null };
    }

    // The only diagnosis an LLM may add; it never overrides a prerequisite found in the lesson graph.
    const outside = item?.diagnosis === "outside_material" && finding.kind === "gap" && finding.diagnosis !== "prerequisite";
    const reasoning = item && nonEmpty(item.reasoning) ? item.reasoning : (base.reasoning ?? null);
    return {
      finding,
      title: item?.title ?? base.title,
      body: item?.body ?? base.body,
      reasoning: outside || finding.diagnosis === "prerequisite" ? reasoning : null,
      diagnosis: outside ? "outside_material" : finding.diagnosis,
      evidence,
      suggestion,
      source: item ? "llm" : "template",
    };
  });

  const summaryOk = llm && nonEmpty(llm.summary) && !containsSensitive(llm.summary);
  if (llm && !summaryOk) rejections.push({ concept_key: "*", reason: "summary_rejected" });
  return { summary: summaryOk ? llm.summary : template.summary, insights, rejections };
}
