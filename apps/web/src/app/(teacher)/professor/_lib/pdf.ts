// Owner: Person 1. Layout helpers for the PDFs built in the browser (pdf-lib): word wrap by real glyph widths, mixed
// fonts on one line, and a page flow that keeps each block (one question) on a single page when it fits.
// Pure functions: the fonts come in as a `measure` callback, so the tests run without any font file.

/** A4 in points. */
export const A4 = { width: 595.28, height: 841.89 } as const;

/** Millimetres to points. */
export const mm = (v: number) => (v * 72) / 25.4;

/** `#rrggbb` to the 0–1 channels pdf-lib's `rgb()` takes. */
export function hexChannels(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** A piece of text in one font and color. Runs glue to each other: put the space inside the text. */
export interface Run<F> {
  text: string;
  font: F;
  color?: string;
}

/** A run placed on a line, `x` points from the line start. */
export interface Seg<F> extends Run<F> {
  x: number;
}

export type Measure<F> = (text: string, font: F) => number;

interface Token<F> {
  word: string;
  font: F;
  color?: string;
  run: number;
  /** Whitespace before this word in the source text. */
  space: boolean;
}

/** Splits a word wider than the line into chunks that fit, by characters. */
function chunks<F>(word: string, font: F, width: number, measure: Measure<F>) {
  const out: string[] = [];
  let current = "";
  for (const ch of word) {
    if (current && measure(current + ch, font) > width) {
      out.push(current);
      current = ch;
    } else current += ch;
  }
  if (current) out.push(current);
  return out;
}

/** Greedy word wrap of mixed-font runs to `width`. Long words are broken, so nothing ever overflows. */
export function wrapRuns<F>(runs: Run<F>[], width: number, measure: Measure<F>): Seg<F>[][] {
  const tokens: Token<F>[] = [];
  let space = false;
  runs.forEach((r, run) => {
    for (const m of r.text.matchAll(/\s+|\S+/g)) {
      if (/^\s/.test(m[0])) {
        space = true;
        continue;
      }
      chunks(m[0], r.font, width, measure).forEach((word, i) =>
        tokens.push({ word, font: r.font, color: r.color, run, space: i === 0 && space }),
      );
      space = false;
    }
  });

  const lines: Seg<F>[][] = [];
  let line: Seg<F>[] = [];
  let x = 0;
  let lastRun = -1;
  for (const t of tokens) {
    let lead = line.length && t.space ? " " : "";
    const w = measure(t.word, t.font);
    if (line.length && x + (lead ? measure(lead, t.font) : 0) + w > width) {
      lines.push(line);
      line = [];
      x = 0;
      lastRun = -1;
      lead = ""; // a new line drops the space before its first word
    }
    const last = line[line.length - 1];
    if (last && lastRun === t.run) last.text += lead + t.word;
    else line.push({ text: lead + t.word, font: t.font, color: t.color, x });
    x += (lead ? measure(lead, t.font) : 0) + w;
    lastRun = t.run;
  }
  if (line.length) lines.push(line);
  return lines;
}

/** Plain text in one font, as lines of strings. */
export function wrapText<F>(text: string, font: F, width: number, measure: Measure<F>): string[] {
  return wrapRuns([{ text, font }], width, measure).map((l) => l.map((s) => s.text).join(""));
}

/** Something to place: a stack of rows (their heights) and the space above it. */
export interface FlowBlock {
  gapBefore: number;
  rows: number[];
}

/** Where a row landed: the y of its top edge (PDF coordinates, from the bottom). */
export interface Placed {
  block: number;
  row: number;
  top: number;
}

/**
 * Places blocks top to bottom between `top` and `bottom`, one array per page. A block that does not fit in what is
 * left of the page moves whole to the next one; only a block taller than a full page is split between rows. The gap
 * above a block is dropped at the top of a page.
 */
export function paginate(blocks: FlowBlock[], area: { top: number; bottom: number }): Placed[][] {
  const pages: Placed[][] = [[]];
  const full = area.top - area.bottom;
  let y = area.top;
  const empty = () => pages[pages.length - 1]!.length === 0;
  const newPage = () => {
    pages.push([]);
    y = area.top;
  };
  blocks.forEach((b, block) => {
    const total = b.rows.reduce((s, h) => s + h, 0);
    if (!empty() && y - b.gapBefore - total < area.bottom && total <= full) newPage();
    if (!empty()) y -= b.gapBefore;
    b.rows.forEach((h, row) => {
      if (!empty() && y - h < area.bottom) newPage();
      pages[pages.length - 1]!.push({ block, row, top: y });
      y -= h;
    });
  });
  return pages;
}
