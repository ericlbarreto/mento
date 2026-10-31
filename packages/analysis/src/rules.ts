import {
  RULES_VERSION,
  type AnalysisInput,
  type ConceptMetrics,
  type Finding,
  type InputEvidence,
  type InsightEvidence,
  type RuleId,
  type Severity,
} from "@mento/contracts";
import { diagnose } from "./diagnose";

export { RULES_VERSION };

const SEVERITY_BY_PREFIX: Record<string, Severity> = { R: "critical", M: "medium", P: "positive" };
export const severityOf = (rule: RuleId): Severity => SEVERITY_BY_PREFIX[rule.charAt(0)]!;
export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, medium: 1, positive: 2 };

/** Per-concept numbers over every session up to the trigger session (`last_*` = trigger session only). */
export function conceptMetrics(input: AnalysisInput, conceptKey: string): ConceptMetrics {
  const m: ConceptMetrics = {
    attempts: 0, correct: 0, partial: 0, incorrect: 0, independent_correct: 0, hints_used: 0,
    sessions: 0, incorrect_sessions: 0, last_attempts: 0, last_incorrect: 0, last_independent_correct: 0, earlier_incorrect: 0,
  };
  for (const s of input.sessions) {
    const rows = s.evidence.filter((e) => e.concept_key === conceptKey);
    if (rows.length === 0) continue;
    const isTrigger = s.session_id === input.trigger_session_id;
    const incorrect = rows.filter((e) => e.result === "incorrect").length;
    const independent = rows.filter((e) => e.result === "correct" && e.independent).length;
    m.sessions += 1;
    if (incorrect > 0) m.incorrect_sessions += 1;
    m.attempts += rows.length;
    m.correct += rows.filter((e) => e.result === "correct").length;
    m.partial += rows.filter((e) => e.result === "partial").length;
    m.incorrect += incorrect;
    m.independent_correct += independent;
    m.hints_used += rows.reduce((a, e) => a + e.hints_used, 0);
    if (isTrigger) {
      m.last_attempts += rows.length;
      m.last_incorrect += incorrect;
      m.last_independent_correct += independent;
    } else {
      m.earlier_incorrect += incorrect;
    }
  }
  return m;
}

/** rules-v1: ordered, the first rule that matches wins. */
export function selectRule(m: ConceptMetrics): RuleId | null {
  if (m.earlier_incorrect >= 1 && m.last_independent_correct >= 2 && m.last_incorrect === 0) return "P2_resolved";
  if (m.incorrect_sessions >= 2) return "R3_recurring";
  if (m.incorrect >= 2) return "R1_repeated_errors";
  if (m.incorrect === 1 || m.partial >= 1) return "M1_single_error";
  if (m.correct > 0 && m.independent_correct === 0) return "M2_needs_hints";
  if (m.independent_correct >= 2) return "P1_consistent";
  if (m.independent_correct === 1) return "P3_first_success";
  return null;
}

const BASE_CONFIDENCE: Record<RuleId, number> = {
  R3_recurring: 0.8, R1_repeated_errors: 0.7, M1_single_error: 0.4, M2_needs_hints: 0.4,
  P2_resolved: 0.8, P1_consistent: 0.7, P3_first_success: 0.4,
};

/** `min(base + 0.05 × (attempts − 1), attempts < 2 ? 0.5 : 0.9)`, never an opinion of the model. */
export function confidenceFor(rule: RuleId, attempts: number): number {
  const raw = BASE_CONFIDENCE[rule] + 0.05 * (attempts - 1);
  return Math.round(Math.min(raw, attempts < 2 ? 0.5 : 0.9) * 100) / 100;
}

const toEvidence = (rows: InputEvidence[]): InsightEvidence[] =>
  rows.flatMap((r) => (r.answer_event_id && r.answer ? [{ event_id: r.answer_event_id, quote: r.answer }] : []));

/** The student's own answers that justify a finding (oldest first, at most 3). */
export function pickEvidence(rule: RuleId, rows: InputEvidence[]): InsightEvidence[] {
  const independent = rows.filter((r) => r.result === "correct" && r.independent);
  if (rule === "P2_resolved") {
    const firstWrong = rows.find((r) => r.result === "incorrect");
    return toEvidence([...(firstWrong ? [firstWrong] : []), ...independent.slice(-2)]);
  }
  if (rule === "P1_consistent" || rule === "P3_first_success") return toEvidence(independent.slice(-3));
  const wrong = rows.filter((r) => r.result !== "correct");
  return toEvidence((wrong.length > 0 ? wrong : rows.filter((r) => r.result === "correct" && r.hints_used > 0)).slice(-3));
}

/** Findings for the concepts that appeared in the trigger session, most severe first. Empty for short sessions. */
export function computeFindings(input: AnalysisInput): Finding[] {
  if (input.skip_reason) return [];
  const trigger = input.sessions.find((s) => s.session_id === input.trigger_session_id);
  if (!trigger) return [];
  const touched = [...new Set(trigger.evidence.map((e) => e.concept_key))];
  const findings: Finding[] = [];
  for (const key of touched) {
    const rows = input.sessions.flatMap((s) => s.evidence.filter((e) => e.concept_key === key));
    const metrics = conceptMetrics(input, key);
    const rule = selectRule(metrics);
    if (!rule) continue;
    const severity = severityOf(rule);
    const kind = severity === "positive" ? "progress" : "gap";
    const { diagnosis, root_cause } =
      kind === "gap"
        ? diagnose({ studying_lesson_id: input.studying_lesson_id, evidence: rows, sequence: input.material.sequence })
        : { diagnosis: null, root_cause: null };
    findings.push({
      concept: rows[rows.length - 1]!.concept,
      concept_key: key,
      kind,
      rule,
      severity,
      confidence: confidenceFor(rule, metrics.attempts),
      metrics,
      lesson_ids: [...new Set(rows.flatMap((r) => (r.lesson_id ? [r.lesson_id] : [])))],
      diagnosis,
      root_cause,
      evidence: pickEvidence(rule, rows),
    });
  }
  return findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.concept_key < b.concept_key ? -1 : 1));
}
