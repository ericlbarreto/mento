// Owner: Person 1. The two PDFs of a generated exercise list (D72): the teacher's copy with the answer key and the
// student's copy without answers. Built in the browser from the list the API returns; the drawing code, pdf-lib and
// the fonts load only when a PDF is made (`exercise-pdf.ts`).
import type { ExerciseList } from "@mento/contracts";

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

/** The teacher's copy has the answers and why; the student's copy has a name row and blank lines for open questions. */
export async function exercisePdf(list: ExerciseList, opts: { forTeacher: boolean; subject: string }): Promise<Blob> {
  const { fetchFonts, renderExercisePdf } = await import("./exercise-pdf");
  const bytes = await renderExercisePdf(list, opts, await fetchFonts());
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
}
