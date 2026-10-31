// Owner: Person 1. The two PDFs of a generated exercise list (D72): the teacher's copy with the answer key and the
// student's copy without answers. Built in the browser from the list the API returns.
import type { ExerciseList } from "@mento/contracts";
import { makePdf, type PdfLine } from "./pdf";

const LETTERS = "abcdefgh";

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function exerciseFileName(list: Pick<ExerciseList, "title">, forTeacher: boolean) {
  return `${slug(list.title)}-${forTeacher ? "professor" : "aluno"}.pdf`;
}

/** The teacher's copy has the answers and why; the student's copy has blank lines for the open questions. */
export function exercisePdf(list: ExerciseList, opts: { forTeacher: boolean; subject: string }): Blob {
  const source = list.lesson_title ? `${list.lesson_title}${list.pages ? ` (p. ${list.pages[0]}–${list.pages[1]})` : ""}` : null;
  const lines: PdfLine[] = [
    { text: opts.forTeacher ? "LISTA DE EXERCÍCIOS · GABARITO DO PROFESSOR" : "LISTA DE EXERCÍCIOS", size: 9, bold: true, color: "blue" },
    { text: list.title, size: 18, bold: true, gap: 4 },
    { text: `${opts.subject} · ${list.grade_level} · ${list.exercises.length} questões`, size: 10, color: "soft" },
  ];
  if (opts.forTeacher) {
    lines.push({ text: `Tópico: ${list.concept}${source ? ` · Base: ${source}` : ""}`, size: 10, color: "soft", gap: 2 });
    lines.push({ text: "Questões geradas pela IA a partir do livro. Revise antes de usar em sala.", size: 10, color: "soft", gap: 2 });
  } else {
    lines.push({ text: "Nome: _______________________________________   Data: ____/____", size: 11, gap: 14 });
  }

  list.exercises.forEach((ex, i) => {
    lines.push({ text: `${i + 1}. ${ex.prompt}`, size: 12, bold: true, gap: 16 });
    ex.options?.forEach((opt, j) => lines.push({ text: `${LETTERS[j]}) ${opt}`, indent: 16, gap: 2 }));
    if (opts.forTeacher) {
      const letter = ex.options ? LETTERS[ex.options.indexOf(ex.answer)] : undefined;
      lines.push({ text: `Resposta: ${letter ? `${letter}) ` : ""}${ex.answer}`, bold: true, color: "blue", indent: 16, gap: 6 });
      lines.push({ text: `Por quê: ${ex.explanation}`, color: "soft", indent: 16 });
    } else if (ex.kind === "open") {
      for (let k = 0; k < 3; k++) lines.push({ text: "_".repeat(78), color: "soft", gap: 8 });
    }
  });

  return makePdf(lines, `Mento · ${opts.forTeacher ? "gabarito do professor" : "lista do aluno"} · gerada por IA`);
}
