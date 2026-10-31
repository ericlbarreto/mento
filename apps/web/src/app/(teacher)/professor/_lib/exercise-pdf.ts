// Owner: Person 1. The exercise-list PDF itself (D72), drawn with pdf-lib and embedded open fonts (OFL, from
// @fontsource): Source Serif 4 for the questions, Nunito Sans for labels. Loaded on demand by `exercises.ts`, so
// pdf-lib and the fonts never weigh on the teacher pages.
import type { Exercise, ExerciseList } from "@mento/contracts";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, setCharacterSpacing, type PDFFont, type PDFPage } from "pdf-lib";
import { A4, hexChannels, mm, paginate, wrapRuns, type Run, type Seg } from "./pdf";

/** Served from `apps/web/public/fonts/pdf/` (latin subset: covers every pt-BR character and typographic quotes). */
export const FONT_FILES = {
  serif: "source-serif-4-latin-400-normal.woff",
  serifBold: "source-serif-4-latin-600-normal.woff",
  sans: "nunito-sans-latin-400-normal.woff",
  sansBold: "nunito-sans-latin-700-normal.woff",
} as const;
export type FontName = keyof typeof FONT_FILES;
export type FontBytes = Record<FontName, Uint8Array | ArrayBuffer>;
type Fonts = Record<FontName, PDFFont>;

let cached: Promise<FontBytes> | null = null;

/** Fetches the font files once per page load. */
export function fetchFonts(base = "/fonts/pdf/"): Promise<FontBytes> {
  cached ??= Promise.all(
    (Object.keys(FONT_FILES) as FontName[]).map(async (name) => {
      const res = await fetch(base + FONT_FILES[name]);
      if (!res.ok) throw new Error(`font ${FONT_FILES[name]}: ${res.status}`);
      return [name, await res.arrayBuffer()] as const;
    }),
  )
    .then((entries) => Object.fromEntries(entries) as FontBytes)
    .catch((err) => {
      cached = null;
      throw err;
    });
  return cached;
}

// Quiet print palette (the demo textbooks' tones): soft ink, never pure black.
const C = {
  ink: "#3b4150",
  prompt: "#2c3242",
  head: "#22305e",
  blue: "#1e59ed",
  blueSoft: "#e8eefd",
  soft: "#6b7180",
  faint: "#8a8f99",
  rule: "#d9dce3",
  writing: "#d3d7df",
  bubble: "#a3a9b8",
  answerBg: "#f5f7fc",
  answerRule: "#8d9be0",
  noteBg: "#fdf7f1",
  noteRule: "#e0a066",
  noteInk: "#8a5523",
};

const MARGIN = { x: mm(23), top: mm(22), bottom: mm(24) };
const WIDTH = A4.width - 2 * MARGIN.x;
const LEFT = MARGIN.x;
/** The question text starts after the number badge. */
const BODY = 30;
const LETTERS = "abcdefgh";

interface Row {
  height: number;
  draw: (page: PDFPage, top: number) => void;
}
interface Block {
  gapBefore: number;
  rows: Row[];
}

const color = (hex: string) => rgb(...hexChannels(hex));
const measure = (size: number) => (text: string, font: PDFFont) =>
  font.widthOfTextAtSize(text, size);

/** Baseline for a line of `size` text centred in a row of `leading`. */
const baseline = (top: number, leading: number, size: number) => top - leading / 2 - size * 0.32;

function drawLine(
  page: PDFPage,
  line: Seg<PDFFont>[],
  x: number,
  y: number,
  size: number,
  fallback: string,
) {
  for (const s of line)
    page.drawText(s.text, { x: x + s.x, y, size, font: s.font, color: color(s.color ?? fallback) });
}

/** Small uppercase label with letter spacing (pdf-lib has no option for it, so the operator goes in by hand). */
function drawSpaced(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  hex: string,
  spacing: number,
) {
  page.pushOperators(setCharacterSpacing(spacing));
  page.drawText(text, { x, y, size, font, color: color(hex) });
  page.pushOperators(setCharacterSpacing(0));
}

/** One row per wrapped line. */
function textRows(
  runs: Run<PDFFont>[],
  opts: { x: number; width: number; size: number; leading: number; color: string },
): Row[] {
  return wrapRuns(runs, opts.width, measure(opts.size)).map((line) => ({
    height: opts.leading,
    draw: (page, top) =>
      drawLine(page, line, opts.x, baseline(top, opts.leading, opts.size), opts.size, opts.color),
  }));
}

const space = (height: number): Row => ({ height, draw: () => {} });

/** A quiet box with a left rule, drawn as one row so it never splits. */
function boxRow(
  runs: Run<PDFFont>[][],
  opts: {
    x: number;
    width: number;
    size: number;
    leading: number;
    color: string;
    bg: string;
    rule: string;
    pad?: number;
    gap?: number;
  },
): Row {
  const pad = opts.pad ?? 9;
  const gap = opts.gap ?? 4;
  const inner = opts.width - 2 * 12;
  const paragraphs = runs.map((r) => wrapRuns(r, inner, measure(opts.size)));
  const lines = paragraphs.reduce((n, p) => n + p.length, 0);
  const height = 2 * pad + lines * opts.leading + gap * (paragraphs.length - 1);
  return {
    height,
    draw: (page, top) => {
      page.drawRectangle({
        x: opts.x,
        y: top - height,
        width: opts.width,
        height,
        color: color(opts.bg),
      });
      page.drawRectangle({ x: opts.x, y: top - height, width: 2, height, color: color(opts.rule) });
      let y = top - pad;
      for (const p of paragraphs) {
        for (const line of p) {
          drawLine(
            page,
            line,
            opts.x + 12,
            baseline(y, opts.leading, opts.size),
            opts.size,
            opts.color,
          );
          y -= opts.leading;
        }
        y -= gap;
      }
    },
  };
}

function header(
  list: ExerciseList,
  opts: { forTeacher: boolean; subject: string },
  f: Fonts,
): Block[] {
  const n = list.exercises.length;
  const meta = [
    opts.subject,
    list.grade_level,
    n === 1 ? "1 questão" : `${n} questões`,
    list.concept,
  ].join("  ·  ");
  const base = list.lesson_title
    ? `Base: ${list.lesson_title}${list.pages ? ` (p. ${list.pages[0]}–${list.pages[1]})` : ""}`
    : null;
  const label = opts.forTeacher
    ? "LISTA DE EXERCÍCIOS · GABARITO DO PROFESSOR"
    : "LISTA DE EXERCÍCIOS";
  const metaOpts = { x: LEFT, width: WIDTH, size: 9.5, leading: 14, color: C.soft };

  const top: Block = {
    gapBefore: 0,
    rows: [
      {
        height: 12,
        draw: (page, t) => drawSpaced(page, label, LEFT, t - 9, 7.5, f.sansBold, C.blue, 1.1),
      },
      space(8),
      ...textRows([{ text: list.title, font: f.sansBold }], {
        x: LEFT,
        width: WIDTH,
        size: 19,
        leading: 24,
        color: C.head,
      }),
      space(5),
      ...textRows([{ text: meta, font: f.sans }], metaOpts),
      ...(opts.forTeacher && base ? textRows([{ text: base, font: f.sans }], metaOpts) : []),
      space(12),
      {
        height: 1,
        draw: (page, t) =>
          page.drawLine({
            start: { x: LEFT, y: t },
            end: { x: LEFT + WIDTH, y: t },
            thickness: 0.6,
            color: color(C.rule),
          }),
      },
    ],
  };

  if (opts.forTeacher) {
    const note = boxRow(
      [
        [
          { text: "Questões geradas pela IA a partir do livro. ", font: f.sansBold },
          { text: "Revise antes de usar em sala.", font: f.sans },
        ],
      ],
      {
        x: LEFT,
        width: WIDTH,
        size: 9,
        leading: 13,
        color: C.noteInk,
        bg: C.noteBg,
        rule: C.noteRule,
        pad: 7,
      },
    );
    return [top, { gapBefore: 14, rows: [note] }];
  }

  // Nome ____ Turma ____ Data __/__/____ on light rules.
  const fields: Row = {
    height: 22,
    draw: (page, t) => {
      const y = t - 16;
      const size = 8.5;
      const lineAt = (x0: number, x1: number) =>
        page.drawLine({
          start: { x: x0, y: y - 2 },
          end: { x: x1, y: y - 2 },
          thickness: 0.6,
          color: color(C.writing),
        });
      const labelAt = (text: string, x: number) => {
        page.drawText(text, { x, y, size, font: f.sansBold, color: color(C.soft) });
        return x + f.sansBold.widthOfTextAtSize(text, size) + 5;
      };
      const right = LEFT + WIDTH;
      const dateX = right - 102;
      const turmaX = dateX - 98;
      lineAt(labelAt("Nome", LEFT), turmaX - 14);
      lineAt(labelAt("Turma", turmaX), dateX - 14);
      let x = labelAt("Data", dateX);
      const slash = f.sans.widthOfTextAtSize("/", 10);
      for (const w of [16, 16, right - x - 2 * (16 + slash + 4)]) {
        lineAt(x, x + w);
        x += w;
        if (x < right - 1) {
          page.drawText("/", { x: x + 2, y, size: 10, font: f.sans, color: color(C.bubble) });
          x += slash + 4;
        }
      }
    },
  };
  return [top, { gapBefore: 16, rows: [fields] }];
}

function question(ex: Exercise, i: number, forTeacher: boolean, f: Fonts): Block {
  const x = LEFT + BODY;
  const width = WIDTH - BODY;
  const prompt = textRows([{ text: ex.prompt, font: f.serif }], {
    x,
    width,
    size: 11,
    leading: 16.5,
    color: C.prompt,
  });
  // The number badge sits on the first line of the prompt.
  const first = prompt[0]!;
  const drawFirst = first.draw;
  first.draw = (page, top) => {
    const cy = baseline(top, 16.5, 11) + 3.6;
    page.drawCircle({ x: LEFT + 9.5, y: cy, size: 9.5, color: color(C.blueSoft) });
    const num = String(i + 1);
    const w = f.sansBold.widthOfTextAtSize(num, 9.5);
    page.drawText(num, {
      x: LEFT + 9.5 - w / 2,
      y: cy - 3.3,
      size: 9.5,
      font: f.sansBold,
      color: color(C.blue),
    });
    drawFirst(page, top);
  };
  const rows: Row[] = [...prompt];

  if (ex.options?.length) {
    rows.push(space(5));
    const optX = x + 30;
    ex.options.forEach((opt, j) => {
      const lines = textRows([{ text: opt, font: f.serif }], {
        x: optX,
        width: width - 30,
        size: 10.5,
        leading: 15,
        color: C.ink,
      });
      const firstOpt = lines[0]!;
      const drawOpt = firstOpt.draw;
      firstOpt.draw = (page, top) => {
        const y = baseline(top, 15, 10.5);
        // The teacher's copy fills the right bubble, so the key reads at a glance.
        const right = forTeacher && opt === ex.answer;
        page.drawCircle({
          x: x + 5,
          y: y + 3.4,
          size: 4.8,
          borderColor: color(right ? C.blue : C.bubble),
          borderWidth: 0.8,
          ...(right ? { color: color(C.blue) } : {}),
        });
        page.drawText(`${LETTERS[j]})`, {
          x: x + 15,
          y,
          size: 9.5,
          font: f.sansBold,
          color: color(C.soft),
        });
        drawOpt(page, top);
      };
      lines[lines.length - 1]!.height += 3;
      rows.push(...lines);
    });
  }

  if (forTeacher) {
    const letter = ex.options ? LETTERS[ex.options.indexOf(ex.answer)] : undefined;
    const why: Run<PDFFont>[] = [
      { text: "Por quê: ", font: f.sansBold, color: C.soft },
      { text: ex.explanation, font: f.serif },
    ];
    if (ex.page != null) why.push({ text: `  p. ${ex.page}`, font: f.sans, color: C.faint });
    rows.push(space(8));
    rows.push(
      boxRow(
        [
          [
            { text: "Resposta: ", font: f.sansBold, color: C.head },
            // A choice answer is short and bold; an expected open answer is a sentence, in regular weight.
            {
              text: `${letter ? `${letter}) ` : ""}${ex.answer}`,
              font: letter ? f.serifBold : f.serif,
              color: C.head,
            },
          ],
          why,
        ],
        { x, width, size: 10, leading: 14.5, color: C.ink, bg: C.answerBg, rule: C.answerRule },
      ),
    );
  } else if (ex.kind === "open") {
    rows.push(space(4));
    for (let k = 0; k < 4; k++) {
      rows.push({
        height: 24,
        draw: (page, top) =>
          page.drawLine({
            start: { x, y: top - 22 },
            end: { x: LEFT + WIDTH, y: top - 22 },
            thickness: 0.6,
            color: color(C.writing),
          }),
      });
    }
  }
  return { gapBefore: i === 0 ? 22 : 20, rows };
}

/** The teacher's copy (answers and why, with the page) or the student's (name row, blank lines). */
export async function renderExercisePdf(
  list: ExerciseList,
  opts: { forTeacher: boolean; subject: string },
  bytes: FontBytes,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const entries = await Promise.all(
    (Object.keys(FONT_FILES) as FontName[]).map(
      async (name) => [name, await doc.embedFont(bytes[name], { subset: true })] as const,
    ),
  );
  const f = Object.fromEntries(entries) as Fonts;

  doc.setTitle(`${list.title}${opts.forTeacher ? " · gabarito do professor" : ""}`);
  doc.setSubject(`${opts.subject} · ${list.grade_level} · ${list.concept}`);
  doc.setAuthor("Mento");
  doc.setCreator("Mento");
  doc.setProducer("Mento");
  doc.setLanguage("pt-BR");

  const blocks = [
    ...header(list, opts, f),
    ...list.exercises.map((ex, i) => question(ex, i, opts.forTeacher, f)),
  ];
  const pages = paginate(
    blocks.map((b) => ({ gapBefore: b.gapBefore, rows: b.rows.map((r) => r.height) })),
    { top: A4.height - MARGIN.top, bottom: MARGIN.bottom },
  );

  const footer = `Mento · ${opts.forTeacher ? "gabarito do professor" : "lista do aluno"}`;
  pages.forEach((placed, p) => {
    const page = doc.addPage([A4.width, A4.height]);
    for (const at of placed) blocks[at.block]!.rows[at.row]!.draw(page, at.top);
    const y = mm(12);
    page.drawText(footer, { x: LEFT, y, size: 8, font: f.sans, color: color(C.faint) });
    const count = `página ${p + 1} de ${pages.length}`;
    page.drawText(count, {
      x: LEFT + WIDTH - f.sans.widthOfTextAtSize(count, 8),
      y,
      size: 8,
      font: f.sans,
      color: color(C.faint),
    });
  });
  return doc.save();
}
