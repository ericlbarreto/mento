// Owner: Person 1. The teacher's working copy of an exercise list while editing it (D83): plain strings for the form,
// turned into the PATCH body on save. Pure, so it is tested without the UI.
import type { ExerciseKind, ExerciseList, UpdateExerciseListBody } from "@mento/contracts";

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MAX_QUESTIONS = 30;

export interface QuestionDraft {
  /** Stable React key while editing (the API re-numbers ids on save). */
  key: string;
  kind: ExerciseKind;
  prompt: string;
  /** Choice only. Kept when the kind switches, so switching back loses nothing. */
  options: string[];
  /** Index of the right option (choice). */
  correct: number;
  /** The expected answer (open). */
  answer: string;
  explanation: string;
  /** The book page as typed ("" = none). */
  page: string;
}

export interface ListDraft {
  title: string;
  questions: QuestionDraft[];
}

let seq = 0;
const newKey = () => `d${++seq}`;

export function toDraft(list: ExerciseList): ListDraft {
  return {
    title: list.title,
    questions: list.exercises.map((ex) => {
      const options = ex.options?.length ? [...ex.options] : ["", "", "", ""];
      const correct = ex.options ? Math.max(0, ex.options.indexOf(ex.answer)) : 0;
      return {
        key: newKey(),
        kind: ex.kind,
        prompt: ex.prompt,
        options,
        correct,
        answer: ex.kind === "open" ? ex.answer : "",
        explanation: ex.explanation,
        page: ex.page == null ? "" : String(ex.page),
      };
    }),
  };
}

export function blankQuestion(kind: ExerciseKind): QuestionDraft {
  return { key: newKey(), kind, prompt: "", options: ["", "", "", ""], correct: 0, answer: "", explanation: "", page: "" };
}

/** What blocks saving, in the teacher's words (pt-BR), one line per problem. Empty when the draft can be saved. */
export function problemsOf(draft: ListDraft): string[] {
  const out: string[] = [];
  if (!draft.title.trim()) out.push("Dê um título à lista.");
  if (draft.questions.length === 0) out.push("A lista precisa de pelo menos uma questão.");
  if (draft.questions.length > MAX_QUESTIONS) out.push(`No máximo ${MAX_QUESTIONS} questões.`);
  draft.questions.forEach((q, i) => {
    const n = `Questão ${i + 1}`;
    if (!q.prompt.trim()) out.push(`${n}: escreva o enunciado.`);
    if (q.page.trim() && !/^\d{1,5}$/.test(q.page.trim())) out.push(`${n}: a página deve ser um número.`);
    if (q.kind === "open") {
      if (!q.answer.trim()) out.push(`${n}: escreva a resposta esperada.`);
      return;
    }
    const opts = q.options.map((o) => o.trim());
    if (opts.length < MIN_OPTIONS) out.push(`${n}: use pelo menos ${MIN_OPTIONS} alternativas.`);
    else if (opts.some((o) => !o)) out.push(`${n}: preencha todas as alternativas (ou exclua a vazia).`);
    else if (new Set(opts).size !== opts.length) out.push(`${n}: há alternativas repetidas.`);
    if (!opts[q.correct]) out.push(`${n}: marque a alternativa correta.`);
  });
  return out;
}

/** The PATCH body. Call only when `problemsOf` is empty. */
export function toBody(draft: ListDraft): UpdateExerciseListBody {
  return {
    title: draft.title.trim(),
    exercises: draft.questions.map((q) => {
      const page = q.page.trim() ? Number(q.page.trim()) : null;
      const base = { prompt: q.prompt.trim(), explanation: q.explanation.trim(), page };
      if (q.kind === "open") return { kind: "open" as const, ...base, answer: q.answer.trim() };
      const options = q.options.map((o) => o.trim());
      return { kind: "choice" as const, ...base, options, answer: options[q.correct]! };
    }),
  };
}

/** Same content as the saved list (no unsaved changes)? */
export function sameAs(draft: ListDraft, list: ExerciseList): boolean {
  return JSON.stringify(toBody(draft)) === JSON.stringify(toBody(toDraft(list)));
}

// ---- edits (immutable helpers used by the form)

export function updateQuestion(draft: ListDraft, key: string, patch: Partial<QuestionDraft>): ListDraft {
  return { ...draft, questions: draft.questions.map((q) => (q.key === key ? { ...q, ...patch } : q)) };
}

export function removeQuestion(draft: ListDraft, key: string): ListDraft {
  return { ...draft, questions: draft.questions.filter((q) => q.key !== key) };
}

export function moveQuestion(draft: ListDraft, key: string, by: -1 | 1): ListDraft {
  const i = draft.questions.findIndex((q) => q.key === key);
  const j = i + by;
  if (i < 0 || j < 0 || j >= draft.questions.length) return draft;
  const questions = [...draft.questions];
  [questions[i], questions[j]] = [questions[j]!, questions[i]!];
  return { ...draft, questions };
}

export function addOption(q: QuestionDraft): Partial<QuestionDraft> {
  return q.options.length >= MAX_OPTIONS ? {} : { options: [...q.options, ""] };
}

/** Removing an option keeps the same option marked as right (or the first, when the right one goes). */
export function removeOption(q: QuestionDraft, index: number): Partial<QuestionDraft> {
  if (q.options.length <= MIN_OPTIONS) return {};
  const options = q.options.filter((_, i) => i !== index);
  const correct = index === q.correct ? 0 : index < q.correct ? q.correct - 1 : q.correct;
  return { options, correct };
}
