// Owner: Person 1. Pure mapping from the teacher API (Insight, evolution, sessions) to the shapes the screens use.
import type { Insight } from "@mento/contracts";
import { gapStage } from "./status";
import type { ConceptRow, ConceptState, ConceptStep, Gap, Progress, SessionItem, StudentDetail, Suggestion } from "./types";
import type { EvolutionDto, InsightsDto, SessionDto, StudentDetailDto } from "./schemas";
import type { z } from "zod";

const OPEN = new Set(["new", "accepted"]);

export function toSuggestion(i: Insight): Suggestion {
  return { id: i.id, title: i.title, body: i.body, material_ref: i.material_ref, status: i.status };
}

/** A gap insight, with the suggestion that points to it. `resolved` is true for gaps the analysis closed. */
export function toGap(i: Insight, suggestions: Insight[]): Gap {
  const suggestion = suggestions.find((s) => s.related_gap_id === i.id && s.status !== "dismissed");
  return {
    id: i.id,
    student_id: i.student_id,
    session_id: i.session_id,
    concept: i.concept,
    title: i.title,
    description: i.body,
    severity: i.severity === "critical" ? "critical" : "medium",
    evidence: i.evidence,
    attempts: i.metrics.attempts,
    confidence: i.confidence,
    material_ref: i.material_ref ? { pages: i.material_ref.pages } : null,
    status: OPEN.has(i.status) ? "open" : "resolved",
    created_at: i.created_at,
    accepted: i.status === "accepted",
    diagnosis: i.diagnosis,
    root_cause: i.root_cause,
    suggestion: suggestion ? toSuggestion(suggestion) : null,
    sessions: i.metrics.sessions,
    incorrect_sessions: i.metrics.incorrect_sessions,
    rule: i.rule,
  };
}

const all = (d: InsightsDto) => [...d.critical, ...d.medium, ...d.positive];

/** Gaps of the open insights (most severe first), each with its suggestion. */
export function gapsOf(d: InsightsDto): Gap[] {
  const items = all(d);
  const suggestions = items.filter((i) => i.kind === "suggestion");
  return items
    .filter((i) => i.kind === "gap")
    .map((i) => toGap(i, suggestions))
    .sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical") || b.confidence - a.confidence);
}

export function progressOf(d: InsightsDto): Progress[] {
  return all(d)
    .filter((i) => i.kind === "progress" && i.status !== "dismissed")
    .map((i) => ({ id: i.id, concept: i.concept, title: i.title, body: i.body, created_at: i.created_at, rule: i.rule, independent_correct: i.metrics.independent_correct }));
}

/** Per conversation: wrong if any answer was wrong, correct if answered right, partial otherwise. */
const stepOf = (p: EvolutionDto[number]["series"][number]): ConceptStep => (p.incorrect > 0 ? "incorrect" : p.correct > 0 ? "correct" : "partial");

/** Where the concept stands: open gap, still sampling (fewer than 3 answers), consolidated, or in transition. */
export function conceptState(steps: ConceptStep[], n: number, hasOpenGap: boolean): ConceptState {
  if (hasOpenGap) return "gap";
  if (n < 3) return "sampling";
  return steps.slice(-2).every((s) => s === "correct") ? "consolidated" : "in_transition";
}

export function conceptRows(evolution: EvolutionDto, openGaps: Gap[]): ConceptRow[] {
  const gapKeys = new Set(openGaps.map((g) => g.concept.toLowerCase()));
  return evolution.map((e) => {
    const steps = e.series.map(stepOf);
    const hasGap = openGaps.some((g) => g.concept === e.concept) || gapKeys.has(e.concept.toLowerCase());
    return { concept_key: e.concept_key, concept: e.concept, n: e.n, steps, state: conceptState(steps, e.n, hasGap) };
  });
}

export function toSession(s: SessionDto, studentId: string, summary: string | null): SessionItem {
  return {
    id: s.id,
    student_id: studentId,
    topic: s.topic,
    material_title: s.material_title,
    lesson_title: s.lesson_title,
    started_at: s.started_at,
    summary,
    analysis_status: s.analysis_status,
    insight_count: s.insight_count,
    ended_at: s.ended_at,
    concepts: s.concepts,
    questions: s.questions,
    correct: s.correct,
    incorrect: s.incorrect,
  };
}

export function buildStudentDetail(args: {
  studentId: string;
  sessions: SessionDto[];
  detail: z.infer<typeof StudentDetailDto>;
  open: InsightsDto;
  resolved: InsightsDto;
  evolution: EvolutionDto;
}): StudentDetail {
  const { studentId, sessions, detail, open, resolved, evolution } = args;
  const gaps = gapsOf(open);
  const latest = detail.latest_analysis;
  const newestFirst = [...sessions].sort((a, b) => b.started_at.localeCompare(a.started_at));
  return {
    sessions: newestFirst.map((s) => toSession(s, studentId, latest?.session_id === s.id ? latest.summary : null)),
    gaps,
    resolved: gapsOf(resolved).filter((g) => g.status === "resolved"),
    progress: progressOf(open),
    concepts: conceptRows(evolution, gaps),
    latest: latest ? { summary: latest.summary, lesson_title: latest.studying_lesson_title, topic: sessions.find((s) => s.id === latest.session_id)?.topic ?? null, at: latest.analyzed_at } : null,
  };
}

/** The open gaps of the whole class on one topic (concept). */
export interface Topic {
  key: string;
  concept: string;
  gaps: Gap[];
  studentIds: string[];
  critical: boolean;
  persistent: number;
  /** Where the difficulty most often starts: a lesson of the book, or just the pages. */
  origin: { title: string | null; pages: [number, number] } | null;
  /** Suggestions still open for these students (dismissing the intervention dismisses all of them). */
  suggestionIds: string[];
}

const mostCommon = <T>(items: T[], key: (t: T) => string): T | null => {
  const counts = new Map<string, { n: number; item: T }>();
  for (const item of items) counts.set(key(item), { n: (counts.get(key(item))?.n ?? 0) + 1, item });
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.item ?? null;
};

/** Topics with the most students first, then the more severe ones. */
export function topicsOf(gaps: Gap[]): Topic[] {
  const byKey = new Map<string, Gap[]>();
  for (const g of gaps) {
    const key = g.concept.trim().toLowerCase();
    byKey.set(key, [...(byKey.get(key) ?? []), g]);
  }
  return [...byKey.entries()]
    .map(([key, list]) => {
      const origins = list.flatMap((g): NonNullable<Topic["origin"]>[] =>
        g.root_cause ? [{ title: g.root_cause.title, pages: g.root_cause.pages }] : g.material_ref ? [{ title: null, pages: g.material_ref.pages }] : [],
      );
      const suggestions = list.flatMap((g) => (g.suggestion && g.suggestion.status !== "dismissed" ? [g.suggestion] : []));
      return {
        key,
        concept: list[0]!.concept,
        gaps: list,
        studentIds: [...new Set(list.map((g) => g.student_id))],
        critical: list.some((g) => g.severity === "critical"),
        persistent: list.filter((g) => gapStage(g).label === "Persistente").length,
        origin: mostCommon(origins, (o) => `${o.title}|${o.pages.join("-")}`),
        suggestionIds: suggestions.map((s) => s.id),
      };
    })
    .sort((a, b) => b.studentIds.length - a.studentIds.length || Number(b.critical) - Number(a.critical) || b.persistent - a.persistent);
}
