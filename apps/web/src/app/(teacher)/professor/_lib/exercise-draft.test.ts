import { UpdateExerciseListBody, type ExerciseList } from "@mento/contracts";
import { describe, expect, it } from "vitest";
import { addOption, blankQuestion, moveQuestion, problemsOf, removeOption, removeQuestion, sameAs, toBody, toDraft, updateQuestion } from "./exercise-draft";

const choice = (id: string, prompt: string, options: string[], answer: number) => ({
  id,
  kind: "choice" as const,
  prompt,
  options,
  answer: options[answer]!,
  explanation: "Porque sim.",
  page: 35,
});
const LIST: ExerciseList = {
  id: "l1",
  title: "Formas de governo na Roma Antiga",
  concept: "Formas de governo",
  concept_key: "formas de governo",
  material_id: null,
  material_title: null,
  lesson_id: null,
  lesson_title: null,
  pages: null,
  grade_level: "8º ano",
  gap_ids: ["g1"],
  student_count: 1,
  status: "ready",
  error: null,
  model: "test",
  prompt_version: "v1",
  edited_at: null,
  created_at: "2026-10-31T00:00:00Z",
  updated_at: "2026-10-31T00:00:00Z",
  exercises: [
    choice("q1", "Quem comandava o exército na República?", ["O imperador", "Dois cônsules", "O rei", "Os tribunos"], 1),
    choice("q2", "O que era o Senado?", ["Um templo", "Um conselho", "Uma legião", "Um mercado"], 1),
    { id: "q3", kind: "open", prompt: "Explique a passagem da República ao Império.", answer: "Crises e guerras civis.", explanation: "", page: null },
  ],
};

describe("exercise list draft (D81)", () => {
  it("round-trips a generated list: the body is valid and equal to the list", () => {
    const draft = toDraft(LIST);
    expect(problemsOf(draft)).toEqual([]);
    expect(sameAs(draft, LIST)).toBe(true);
    const body = UpdateExerciseListBody.parse(toBody(draft));
    expect(body.exercises.map((e) => e.prompt)).toEqual(LIST.exercises.map((e) => e.prompt));
    expect(body.exercises.map((e) => e.answer)).toEqual(LIST.exercises.map((e) => e.answer));
  });

  it("edits, adds, removes and reorders questions; the right option follows its text", () => {
    let draft = toDraft(LIST);
    const [first, second] = draft.questions;
    draft = updateQuestion(draft, first!.key, { options: first!.options.map((o, i) => (i === first!.correct ? "Dois cônsules (editado)" : o)) });
    draft = removeQuestion(draft, second!.key);
    draft = moveQuestion(draft, first!.key, 1);
    const added = blankQuestion("open");
    draft = { ...draft, questions: [...draft.questions, { ...added, prompt: "Nova?", answer: "Sim." }] };
    expect(sameAs(draft, LIST)).toBe(false);
    const body = UpdateExerciseListBody.parse(toBody(draft));
    expect(body.exercises).toHaveLength(LIST.exercises.length);
    expect(body.exercises[1]).toMatchObject({ kind: "choice", answer: "Dois cônsules (editado)" });
    expect(body.exercises.at(-1)).toMatchObject({ kind: "open", prompt: "Nova?", answer: "Sim.", page: null });
  });

  it("names what blocks saving", () => {
    const q = { ...blankQuestion("choice"), prompt: "?", options: ["A", "A", ""], page: "x" };
    expect(problemsOf({ title: " ", questions: [q] })).toEqual([
      "Dê um título à lista.",
      "Questão 1: a página deve ser um número.",
      "Questão 1: preencha todas as alternativas (ou exclua a vazia).",
    ]);
    expect(problemsOf({ title: "T", questions: [{ ...q, options: ["A", "A"], page: "" }] })).toEqual(["Questão 1: há alternativas repetidas."]);
    expect(problemsOf({ title: "T", questions: [blankQuestion("open")] })).toEqual(["Questão 1: escreva o enunciado.", "Questão 1: escreva a resposta esperada."]);
    expect(problemsOf({ title: "T", questions: [] })).toEqual(["A lista precisa de pelo menos uma questão."]);
  });

  it("removing an option keeps the right one marked; never below 2 or above 6 options", () => {
    const q = { ...blankQuestion("choice"), options: ["A", "B", "C", "D"], correct: 2 };
    expect(removeOption(q, 0)).toEqual({ options: ["B", "C", "D"], correct: 1 });
    expect(removeOption(q, 2)).toEqual({ options: ["A", "B", "D"], correct: 0 });
    expect(removeOption({ ...q, options: ["A", "B"] }, 0)).toEqual({});
    expect(addOption({ ...q, options: ["1", "2", "3", "4", "5", "6"] })).toEqual({});
  });
});
