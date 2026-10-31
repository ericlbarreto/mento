// Owner: Person 1. Exercise lists for an intervention: the mock questions and the two PDFs (teacher with answers,
// student without). The real questions will come from the API (POST /interventions/:id/exercises, to agree on).
import { makePdf, type PdfLine } from "./pdf";
import type { Exercise, ExerciseSet } from "./types";

const LETTERS = "abcdefgh";

const MOCK_EXERCISES: Record<string, { title: string; exercises: Exercise[] }> = {
  int_timeline: {
    title: "Roma: quem decidia em cada período?",
    exercises: [
      {
        id: "ex_1",
        kind: "choice",
        prompt: "Coloque as datas em ordem, da mais antiga para a mais recente: 27 a.C., 509 a.C., 753 a.C. e 44 a.C.",
        options: ["753 a.C., 509 a.C., 44 a.C., 27 a.C.", "27 a.C., 44 a.C., 509 a.C., 753 a.C.", "509 a.C., 753 a.C., 27 a.C., 44 a.C."],
        answer: "a",
        explanation: "Antes de Cristo, quanto maior o número, mais antigo é o ano: a contagem diminui até chegar ao ano 1.",
        concept: "Datas antes de Cristo",
      },
      {
        id: "ex_2",
        kind: "choice",
        prompt: "A partir de 509 a.C., Roma passou a ser governada por:",
        options: ["um imperador", "magistrados eleitos e o Senado", "um rei etrusco"],
        answer: "b",
        explanation: "Com a expulsão do último rei, começou a República: magistrados eleitos governavam e o Senado tinha grande poder.",
        concept: "República e Império",
      },
      {
        id: "ex_3",
        kind: "choice",
        prompt: "No Império, quem tomava as decisões mais importantes em Roma?",
        options: ["O Senado", "As assembleias da plebe", "O imperador"],
        answer: "c",
        explanation: "A partir de Augusto (27 a.C.), o poder de decisão se concentrou nas mãos do imperador.",
        concept: "Papel do Senado no Império",
      },
      {
        id: "ex_4",
        kind: "open",
        prompt: "Depois que Augusto se tornou imperador, o Senado deixou de existir? Explique com suas palavras.",
        answer: "Não. O Senado continuou existindo, mas perdeu o poder de decisão: quem governava era o imperador.",
        explanation: "É a confusão mais comum da turma: o Senado continua, mas sem mandar.",
        concept: "Papel do Senado no Império",
      },
      {
        id: "ex_5",
        kind: "open",
        prompt: "Cite uma diferença entre a República e o Império romano.",
        answer: "Na República, magistrados eleitos e o Senado governavam; no Império, o poder ficou concentrado no imperador.",
        explanation: "Aceite respostas que comparem quem decidia em cada período.",
        concept: "República e Império",
      },
    ],
  },
  int_bread: {
    title: "Roma: a política do pão e circo",
    exercises: [
      {
        id: "ex_1",
        kind: "open",
        prompt: "O que era a política do pão e circo?",
        answer: "A distribuição de trigo e de espetáculos gratuitos para a população de Roma.",
        explanation: "Confira se o aluno cita as duas partes: o alimento e os espetáculos.",
        concept: "Pão e circo",
      },
      {
        id: "ex_2",
        kind: "choice",
        prompt: "Por que o governo de Roma oferecia pão e circo?",
        options: ["Para manter a população satisfeita e evitar revoltas", "Apenas para divertir o povo", "Para cobrar mais impostos"],
        answer: "a",
        explanation: "O objetivo era político: agradar a população e diminuir a insatisfação com o governo.",
        concept: "Pão e circo",
      },
      {
        id: "ex_3",
        kind: "open",
        prompt: "Por que o pão e circo era bom para o imperador? Dê um motivo.",
        answer: "Com a população alimentada e distraída, havia menos protestos contra o governo.",
        explanation: "Aceite respostas que liguem a política ao apoio ou à tranquilidade da população.",
        concept: "Pão e circo",
      },
    ],
  },
};

export function mockExerciseSet(interventionId: string): ExerciseSet | null {
  const found = MOCK_EXERCISES[interventionId];
  return found ? { intervention_id: interventionId, ...found, generated_at: new Date().toISOString() } : null;
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function exerciseFileName(set: ExerciseSet, forTeacher: boolean) {
  return `${slug(set.title)}-${forTeacher ? "professor" : "aluno"}.pdf`;
}

/** The teacher's copy has the answer key; the student's copy has blank lines for open questions. */
export function exercisePdf(set: ExerciseSet, opts: { forTeacher: boolean; gradeLevel: string }): Blob {
  const lines: PdfLine[] = [
    { text: opts.forTeacher ? "LISTA DE EXERCÍCIOS · GABARITO DO PROFESSOR" : "LISTA DE EXERCÍCIOS", size: 9, bold: true, color: "blue" },
    { text: set.title, size: 18, bold: true, gap: 4 },
    { text: `História · ${opts.gradeLevel} · ${set.exercises.length} questões`, size: 10, color: "soft" },
  ];
  if (opts.forTeacher) {
    lines.push({ text: "Questões geradas a partir das lacunas da turma. Revise antes de usar em sala.", size: 10, color: "soft", gap: 2 });
  } else {
    lines.push({ text: "Nome: _______________________________________   Data: ____/____", size: 11, gap: 14 });
  }

  set.exercises.forEach((ex, i) => {
    lines.push({ text: `${i + 1}. ${ex.prompt}`, size: 12, bold: true, gap: 16 });
    ex.options?.forEach((opt, j) => lines.push({ text: `${LETTERS[j]}) ${opt}`, indent: 16, gap: 2 }));
    if (opts.forTeacher) {
      const answer = ex.kind === "choice" ? `${ex.answer}) ${ex.options?.[LETTERS.indexOf(ex.answer)] ?? ""}` : ex.answer;
      lines.push({ text: `Resposta: ${answer}`, bold: true, color: "blue", indent: 16, gap: 6 });
      lines.push({ text: `Por quê: ${ex.explanation}`, color: "soft", indent: 16 });
      lines.push({ text: `Lacuna trabalhada: ${ex.concept}`, size: 9, color: "soft", indent: 16 });
    } else if (ex.kind === "open") {
      for (let k = 0; k < 3; k++) lines.push({ text: "_".repeat(78), color: "soft", gap: 8 });
    }
  });

  return makePdf(lines, `Mento · ${opts.forTeacher ? "gabarito do professor" : "lista do aluno"} · dados simulados`);
}
