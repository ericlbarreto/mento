import type { ExerciseList } from "@mento/contracts";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { FONT_FILES, renderExercisePdf, type FontBytes, type FontName } from "./exercise-pdf";

const fontDir = path.resolve(import.meta.dirname, "../../../../../public/fonts/pdf");
const bytes = {} as FontBytes;
for (const n of Object.keys(FONT_FILES) as FontName[])
  bytes[n] = readFileSync(path.join(fontDir, FONT_FILES[n]));

const choice = (
  id: string,
  prompt: string,
  options: string[],
  answer: number,
  explanation: string,
  page: number | null,
) => ({
  id,
  kind: "choice" as const,
  prompt,
  options,
  answer: options[answer]!,
  explanation,
  page,
});

/** Realistic demo list (synthetic, no student data): 4 choice, 2 open, one long prompt. */
export const LIST: ExerciseList = {
  id: "l1",
  title: "Formas de governo na Roma Antiga",
  concept: "Monarquia, República e Império",
  concept_key: "monarquia republica e imperio",
  material_id: "m1",
  material_title: "História — 8º ano",
  lesson_id: "L2",
  lesson_title: "Capítulo 2 · A República Romana",
  pages: [34, 41],
  grade_level: "8º ano",
  gap_ids: ["g1"],
  student_count: 4,
  status: "ready",
  error: null,
  model: "test",
  prompt_version: "v1",
  edited_at: null,
  created_at: "2026-10-31T00:00:00Z",
  updated_at: "2026-10-31T00:00:00Z",
  exercises: [
    choice(
      "e1",
      "Na República Romana, quem exercia o poder executivo e comandava o exército?",
      [
        "O imperador, escolhido pelo Senado",
        "Dois cônsules, eleitos a cada ano",
        "O rei etrusco",
        "Os tribunos da plebe",
      ],
      1,
      "Os cônsules eram dois magistrados eleitos por um ano; dividir o poder evitava que uma só pessoa voltasse a governar como rei.",
      36,
    ),
    choice(
      "e2",
      "O que eram os “patrícios”?",
      [
        "Escravos libertos",
        "Soldados estrangeiros",
        "Membros das famílias mais antigas e ricas de Roma",
        "Comerciantes gregos",
      ],
      2,
      "Os patrícios descendiam das famílias fundadoras e concentravam as terras e os cargos políticos.",
      35,
    ),
    {
      id: "e3",
      kind: "open",
      prompt:
        "Explique, com suas palavras, por que os plebeus se revoltaram contra os patrícios e cite uma conquista que obtiveram.",
      answer:
        "Porque não tinham direitos políticos nem leis escritas; conquistaram o tribunato da plebe e a Lei das Doze Tábuas.",
      explanation:
        "O livro descreve as revoltas da plebe e a criação dos tribunos, que podiam vetar decisões do Senado.",
      page: 38,
    },
    choice(
      "e4",
      "Leia o trecho: “Roma não foi construída em um dia, e sua passagem da monarquia para a república também não aconteceu de uma hora para outra: foram necessárias décadas de disputas entre famílias, reformas e guerras.” Com base no texto e no que estudamos sobre a queda de Tarquínio, o Soberbo, e a organização das instituições republicanas — Senado, magistraturas e assembleias —, qual alternativa melhor descreve essa transição?",
      [
        "Foi um processo gradual, marcado por conflitos e pela criação de novas instituições",
        "Foi uma decisão imediata do último rei, que entregou o poder ao povo",
        "Aconteceu porque os gregos invadiram Roma e impuseram a democracia",
        "Não houve mudança: o Senado já governava sozinho desde a fundação",
      ],
      0,
      "A expulsão de Tarquínio abriu caminho para a república, mas as instituições se formaram aos poucos, em meio às lutas entre patrícios e plebeus.",
      34,
    ),
    choice(
      "e5",
      "Qual era a função principal do Senado romano durante a República?",
      [
        "Cobrar impostos nas províncias",
        "Aconselhar os magistrados e decidir sobre finanças e guerra",
        "Julgar apenas os escravos",
        "Organizar os jogos no Coliseu",
      ],
      1,
      "O Senado reunia ex-magistrados e orientava a política externa e o uso do tesouro público.",
      null,
    ),
    {
      id: "e6",
      kind: "open",
      prompt:
        "Compare a monarquia e a república em Roma: quem governava em cada período e como as decisões eram tomadas?",
      answer:
        "Na monarquia, o rei governava com o Senado como conselho; na república, cônsules eleitos, Senado e assembleias dividiam o poder.",
      explanation:
        "Quadro comparativo do capítulo: rei vitalício × magistrados com mandato de um ano.",
      page: 41,
    },
  ],
};

describe("renderExercisePdf", () => {
  it("embeds fonts that cover every pt-BR character in the list", async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const sample = "ç ã õ á é ê í ó ô ú à Ç Ã É Ú º ª — – “ ” ‘ ’ … ·";
    const text = [
      sample,
      LIST.title,
      LIST.concept,
      ...LIST.exercises.flatMap((e) => [e.prompt, e.answer, e.explanation, ...(e.options ?? [])]),
    ].join(" ");
    for (const name of Object.keys(FONT_FILES) as FontName[]) {
      const font = await doc.embedFont(bytes[name], { subset: true });
      const covered = new Set(font.getCharacterSet());
      const missing = [...new Set(text.replace(/\s/g, ""))].filter(
        (ch) => !covered.has(ch.codePointAt(0)!),
      );
      expect(missing, name).toEqual([]);
    }
  });

  it("builds both copies as valid A4 PDFs", async () => {
    const out = process.env.EXERCISE_PDF_OUT;
    for (const forTeacher of [false, true]) {
      const pdf = await renderExercisePdf(LIST, { forTeacher, subject: "História" }, bytes);
      const doc = await PDFDocument.load(pdf);
      expect(doc.getPageCount()).toBeGreaterThan(0);
      expect(doc.getPage(0).getSize().width).toBeCloseTo(595.28, 1);
      expect(doc.getTitle()).toContain(LIST.title);
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(path.join(out, forTeacher ? "professor.pdf" : "aluno.pdf"), pdf);
      }
    }
  });

  it("builds an edited list (D81): two options, a blank explanation, an added open question", async () => {
    const edited: ExerciseList = {
      ...LIST,
      edited_at: "2026-10-31T12:00:00Z",
      exercises: [
        { id: "q1", kind: "choice", prompt: "Roma foi uma república?", options: ["Sim", "Não"], answer: "Sim", explanation: "", page: null },
        { id: "q2", kind: "open", prompt: "Explique o papel do Senado.", answer: "Aconselhava os magistrados.", explanation: "", page: 36 },
      ],
    };
    for (const forTeacher of [false, true]) {
      const doc = await PDFDocument.load(await renderExercisePdf(edited, { forTeacher, subject: "História" }, bytes));
      expect(doc.getPageCount()).toBe(1);
    }
  });
});
