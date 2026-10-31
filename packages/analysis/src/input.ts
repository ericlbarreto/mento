import {
  RULES_VERSION,
  isBoardEditEvent,
  type AnalysisInput,
  type ClassContext,
  type Counters,
  type SessionEvent,
  type Evidence,
  type InputEvidence,
  type InputSession,
  type Material,
  type SessionBundle,
  type Turn,
} from "@mento/contracts";

/**
 * The student's board edits (plans F and G, D79, D81): deleting, moving or placing a block is not educational evidence, so the analysis and
 * every teacher view never see them, not even as counts (AGENTS.md rule 6).
 */
export const withoutBoardEdits = <E extends { type: string }>(events: E[]): E[] => events.filter((e) => !isBoardEditEvent(e.type));

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** contracts-spec §8: student turns from user messages and verification answers; tutor turns from `speak` / `write_text`. */
export function toTurns(events: SessionEvent[]): Turn[] {
  const turns: Turn[] = [];
  for (const e of events) {
    if (e.type === "user_message") turns.push({ event_id: e.id, role: "student", text: e.payload.text });
    else if (e.type === "verification_answered") turns.push({ event_id: e.id, role: "student", text: e.payload.answer });
    else if (e.type === "tutor_action") {
      const args = e.payload.args;
      const text =
        e.payload.name === "speak" && typeof args.text === "string"
          ? args.text
          : e.payload.name === "write_text" && typeof args.html === "string"
            ? stripHtml(args.html)
            : "";
      if (text) {
        const purpose = typeof args.purpose === "string" ? args.purpose : undefined;
        turns.push({ event_id: e.id, role: "tutor", text, ...(purpose ? { purpose } : {}) });
      }
    }
  }
  return turns;
}

export function countersOf(events: SessionEvent[], evidence: Pick<Evidence, "result" | "independent">[]): Counters {
  const n = (result: Evidence["result"]) => evidence.filter((e) => e.result === result).length;
  return {
    user_messages: events.filter((e) => e.type === "user_message").length,
    hints_given: events.filter((e) => e.type === "hint_given").length,
    verifications: evidence.length,
    correct: n("correct"),
    partial: n("partial"),
    incorrect: n("incorrect"),
    independent_correct: evidence.filter((e) => e.result === "correct" && e.independent).length,
  };
}

function toInputSession(bundle: SessionBundle): InputSession {
  const events = withoutBoardEdits(bundle.events).sort((a, b) => a.seq - b.seq);
  const verificationOf = new Map<string, string>(); // evidence_id → verification_id
  const answerOf = new Map<string, { event_id: string; answer: string }>(); // verification_id → answer
  for (const e of events) {
    if (e.type === "evidence_recorded" && e.payload.verification_id) verificationOf.set(e.payload.evidence_id, e.payload.verification_id);
    if (e.type === "verification_answered") answerOf.set(e.payload.verification_id, { event_id: e.id, answer: e.payload.answer });
  }
  const evidence: InputEvidence[] = [...bundle.evidence]
    .sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id))
    .map((ev) => {
      const verificationId = verificationOf.get(ev.id);
      const answer = verificationId ? answerOf.get(verificationId) : undefined;
      return {
        id: ev.id,
        concept: ev.concept,
        concept_key: ev.concept_key,
        lesson_id: ev.lesson_id ?? null,
        result: ev.result,
        independent: ev.independent,
        hints_used: ev.hints_used,
        rationale: ev.rationale,
        ts: ev.ts,
        answer_event_id: answer?.event_id ?? null,
        answer: answer?.answer ?? null,
      };
    });
  return {
    session_id: bundle.session.id,
    topic: bundle.session.topic ?? null,
    lesson_id: bundle.session.lesson_id ?? null,
    started_at: bundle.session.started_at,
    counters: countersOf(events, evidence),
    evidence,
    turns: toTurns(events),
  };
}

export interface BuildInputArgs {
  /** The session that ended and is being analyzed. */
  trigger: SessionBundle;
  /** Sessions of the same student up to and including the trigger (later ones are ignored). */
  history: SessionBundle[];
  material: Pick<Material, "id" | "title" | "subject" | "sequence">;
  class_context: ClassContext | null;
}

/**
 * Pure function: the same conversations + material + class context always give the same input.
 * It never contains the student's name or profile (BR-14).
 */
export function buildAnalysisInput({ trigger, history, material, class_context }: BuildInputArgs): AnalysisInput {
  const bundles = new Map<string, SessionBundle>();
  for (const b of history) {
    if (b.session.student_id === trigger.session.student_id && b.session.started_at <= trigger.session.started_at) bundles.set(b.session.id, b);
  }
  bundles.set(trigger.session.id, trigger);
  const sessions = [...bundles.values()]
    .sort((a, b) => a.session.started_at.localeCompare(b.session.started_at) || a.session.id.localeCompare(b.session.id))
    .map(toInputSession);
  const last = sessions.find((s) => s.session_id === trigger.session.id)!;
  return {
    student_id: trigger.session.student_id,
    trigger_session_id: trigger.session.id,
    studying_lesson_id: trigger.session.lesson_id ?? null,
    rules_version: RULES_VERSION,
    class_context: class_context ? { grade_level: class_context.grade_level, description: class_context.description } : null,
    material: { id: material.id, title: material.title, subject: material.subject, sequence: material.sequence },
    skip_reason: last.counters.user_messages < 2 && last.evidence.length === 0 ? "short_session" : null,
    sessions,
  };
}
