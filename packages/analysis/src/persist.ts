import type { AnalysisInput, Insight, InsightDraft, InsightEvidence, TeacherRepository } from "@mento/contracts";
import { RULES_VERSION } from "@mento/contracts";
import type { ComposedInsight } from "./guardrails";

const OPEN = ["new", "accepted"] as const;
const isOpen = (i: Insight) => (OPEN as readonly string[]).includes(i.status);
const MAX_EVIDENCE = 6;

function mergeEvidence(existing: InsightEvidence[], incoming: InsightEvidence[]): InsightEvidence[] {
  const seen = new Set(existing.map((e) => e.event_id));
  return [...existing, ...incoming.filter((e) => !seen.has(e.event_id))].slice(-MAX_EVIDENCE);
}

export interface PersistResult {
  /** Every insight created or updated by this analysis, in order. */
  touched: Insight[];
  created: Insight[];
}

/**
 * Writes the composed insights. Identity of an insight = (student, kind, concept_key) among the open ones:
 * - an open gap/progress is updated (severity, confidence, text; evidence appended), never duplicated (BR-10)
 * - a gap is `resolved` by rule P2, together with its suggestion (BR-11)
 * - a `dismissed` insight is never reopened or edited (BR-12)
 * - each open gap has at most one suggestion row (BR-13)
 * - an insight written by a *later* session is not overwritten by re-running an older one
 */
export async function persistInsights(args: {
  repo: TeacherRepository;
  analysis_id: string;
  session_id: string;
  input: AnalysisInput;
  composed: ComposedInsight[];
}): Promise<PersistResult> {
  const { repo, analysis_id, session_id, input, composed } = args;
  const known = new Set(input.sessions.map((s) => s.session_id));
  const touched: Insight[] = [];
  const created: Insight[] = [];

  const create = async (draft: InsightDraft) => {
    const insight = await repo.createInsight(draft);
    created.push(insight);
    touched.push(insight);
    return insight;
  };
  const update = async (id: string, patch: Partial<InsightDraft>) => {
    const insight = await repo.updateInsight(id, patch);
    if (insight) touched.push(insight);
    return insight;
  };

  for (const c of composed) {
    const f = c.finding;
    const existing = await repo.listInsights({ student_id: input.student_id, concept_key: f.concept_key });
    const latest = (kind: Insight["kind"]) => existing.find((i) => i.kind === kind && i.status !== "resolved");
    const studyingLesson = input.studying_lesson_id;
    const stale = (i: Insight | undefined) => !!i && !known.has(i.session_id);

    const common = {
      student_id: input.student_id,
      session_id,
      analysis_id,
      rules_version: RULES_VERSION,
      concept: f.concept,
      concept_key: f.concept_key,
      studying_lesson_id: studyingLesson,
      metrics: f.metrics,
      source: c.source,
    } as const;
    const rootCause = f.root_cause && c.reasoning ? { ...f.root_cause, reasoning: c.reasoning } : null;

    if (f.kind === "gap") {
      const gap = latest("gap");
      if (gap?.status === "dismissed" || stale(gap)) continue;
      const fields = {
        ...common, kind: "gap" as const, severity: f.severity, rule: f.rule, title: c.title, body: c.body, confidence: f.confidence,
        diagnosis: c.diagnosis, root_cause: rootCause, material_ref: null, related_gap_id: null,
      };
      const saved = gap
        ? await update(gap.id, { ...fields, evidence: mergeEvidence(gap.evidence, c.evidence) })
        : await create({ ...fields, evidence: c.evidence, status: "new" });
      if (!saved || !c.suggestion) continue;

      const suggestion = existing.find((i) => i.kind === "suggestion" && i.related_gap_id === saved.id && i.status !== "resolved");
      if (suggestion?.status === "dismissed") continue;
      const sFields = {
        ...common, kind: "suggestion" as const, severity: f.severity, rule: f.rule, title: c.suggestion.title, body: c.suggestion.body,
        confidence: f.confidence, diagnosis: c.diagnosis, root_cause: rootCause, material_ref: c.suggestion.material_ref,
        related_gap_id: saved.id, evidence: saved.evidence,
      };
      if (suggestion) await update(suggestion.id, sFields);
      else await create({ ...sFields, status: "new" });
      continue;
    }

    // progress
    if (f.rule === "P2_resolved") {
      for (const i of existing) {
        if ((i.kind === "gap" || i.kind === "suggestion") && isOpen(i) && !stale(i)) await update(i.id, { status: "resolved" });
      }
    }
    const progress = latest("progress");
    if (progress?.status === "dismissed" || stale(progress)) continue;
    const fields = {
      ...common, kind: "progress" as const, severity: f.severity, rule: f.rule, title: c.title, body: c.body, confidence: f.confidence,
      diagnosis: null, root_cause: null, material_ref: null, related_gap_id: null,
    };
    if (progress) await update(progress.id, { ...fields, evidence: mergeEvidence(progress.evidence, c.evidence) });
    else await create({ ...fields, evidence: c.evidence, status: "new" });
  }
  return { touched, created };
}
