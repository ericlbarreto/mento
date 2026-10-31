import {
  lessonOfPage,
  sequenceOf,
  SessionEndReason,
  type Evidence,
  type Lesson,
  type Material,
  type Session,
  type SessionBundle,
  type SessionEvent,
  type StoredEvent,
  type StoredEvidence,
  type StoredSession,
} from "@mento/contracts";

/**
 * Maps what the whiteboard back-end stored (`StoredSession`, `StoredEvent`, `StoredEvidence`) to the analysis's bundle.
 * The tutor does not record which material or lesson a conversation is about, so they are derived here from the sources
 * it cited (page → lesson of the material's sequence). No change to the tutor is needed.
 */
type Cited = { material_id: string; page: number };

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());
const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Sources the tutor attached to a `speak` / `write_text` action. */
function sourcesOf(event: StoredEvent): Cited[] {
  if (event.type !== "tutor_action") return [];
  const args = record(record(event.payload).args);
  const sources = Array.isArray(args.sources) ? args.sources : [];
  return sources.flatMap((s) => {
    const c = record(s);
    return typeof c.material_id === "string" && typeof c.page === "number" ? [{ material_id: c.material_id, page: c.page }] : [];
  });
}

/** The most cited item; on a tie, the one cited last. */
function mostCited<T>(items: T[], key: (item: T) => string): T | null {
  const stats = new Map<string, { count: number; last: number; item: T }>();
  items.forEach((item, i) => {
    const k = key(item);
    const s = stats.get(k);
    stats.set(k, { count: (s?.count ?? 0) + 1, last: i, item });
  });
  return [...stats.values()].sort((a, b) => b.count - a.count || b.last - a.last)[0]?.item ?? null;
}

export function toSessionBundle(raw: { session: StoredSession; events: StoredEvent[]; evidence: StoredEvidence[] }, materials: Map<string, Material>): SessionBundle {
  const events = raw.events;

  // 1. Which material? The one the tutor cited most (tutor sources first, judged citations as a fallback).
  const tutorCitations = events.flatMap(sourcesOf);
  const judgedCitations = raw.evidence.flatMap((e) => (e.citation ? [{ material_id: e.citation.material_id, page: e.citation.page }] : []));
  const known = (cs: Cited[]) => cs.filter((c) => materials.has(c.material_id));
  const material = mostCited(known(tutorCitations).length > 0 ? known(tutorCitations) : known(judgedCitations), (c) => c.material_id);
  const materialId = material?.material_id ?? null;
  const sequence: Lesson[] = materialId ? sequenceOf(materials.get(materialId)!) : [];
  const lessonOf = (c: Cited | null | undefined): string | null =>
    c && c.material_id === materialId ? (lessonOfPage(sequence, c.page)?.lesson_id ?? null) : null;

  // 2. Which lesson is being studied? The one the tutor cited most in that material. On a tie, the one later in the book:
  //    going back to an earlier lesson is remediation (what the analysis looks for), not the topic the student came for.
  const cites = new Map<string, number>();
  for (const c of tutorCitations.length ? tutorCitations : judgedCitations) {
    const id = lessonOf(c);
    if (id) cites.set(id, (cites.get(id) ?? 0) + 1);
  }
  const orderOf = (id: string) => sequence.find((l) => l.lesson_id === id)?.order ?? 0;
  const lessonId = [...cites.entries()].sort((a, b) => b[1] - a[1] || orderOf(b[0]) - orderOf(a[0]))[0]?.[0] ?? null;

  // 3. Which lesson does each question belong to? What the tutor had just explained before asking it.
  const askedAbout = new Map<string, string | null>(); // verification_id → lesson
  const recorded = new Map<string, string>(); // evidence_id → verification_id
  let lastSource: Cited | null = null;
  for (const e of events) {
    const sources = sourcesOf(e);
    if (sources.length) lastSource = sources[sources.length - 1]!;
    const p = record(e.payload);
    if (e.type === "verification_asked" && typeof p.verification_id === "string") askedAbout.set(p.verification_id, lessonOf(lastSource));
    if (e.type === "evidence_recorded" && typeof p.evidence_id === "string" && typeof p.verification_id === "string") recorded.set(p.evidence_id, p.verification_id);
  }

  const evidence: Evidence[] = raw.evidence.map((r) => {
    const fromCitation = r.citation ? lessonOf({ material_id: r.citation.material_id, page: r.citation.page }) : null;
    const verification = recorded.get(r.id);
    return {
      id: r.id,
      session_id: raw.session.id,
      student_id: r.student_id,
      concept: r.concept,
      concept_key: r.concept_key,
      lesson_id: fromCitation ?? (verification ? (askedAbout.get(verification) ?? null) : null),
      result: r.result,
      independent: r.independent,
      hints_used: r.hints_used,
      rationale: r.rationale,
      ...(r.citation ? { citation: r.citation } : {}),
      ts: iso(r.ts),
    };
  });

  const reason = SessionEndReason.safeParse(raw.session.end_reason);
  const session: Session = {
    id: raw.session.id,
    student_id: raw.session.student_id,
    material_id: materialId,
    lesson_id: lessonId,
    ...(raw.session.topic || raw.session.title ? { topic: (raw.session.topic ?? raw.session.title) as string } : {}),
    modality: raw.session.modality,
    status: raw.session.ended_at ? "ended" : "active",
    started_at: iso(raw.session.started_at),
    ...(raw.session.ended_at ? { ended_at: iso(raw.session.ended_at) } : {}),
    ...(reason.success ? { end_reason: reason.data } : {}),
    is_simulated: false,
  };

  return {
    session,
    // The log is append-only and ordered; `seq` makes that order explicit for the analysis.
    events: events.map((e, i) => ({ id: e.id, session_id: raw.session.id, seq: i + 1, ts: iso(e.ts), type: e.type, payload: e.payload }) as SessionEvent),
    evidence,
  };
}
