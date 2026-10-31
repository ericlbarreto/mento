// Plan E: render the demo textbooks. materials/src/<key>/book.md → materials/<key>.html → materials/<key>.pdf (headless
// Chrome). Two passes: the first PDF tells on which page each chapter starts, the second prints those numbers in the
// Sumário. Usage: pnpm materials:render [key]   (no key = every book under materials/src/, folders starting with "_" skipped)
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdfPages } from "@mento/sources/ingest";
import { COVER_NOTE, findChapterStarts, parseBook, tocHtml, type Book, type PageMap } from "./lib/book";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MATERIALS = fileURLToPath(new URL("../materials/", import.meta.url));
const SRC = join(MATERIALS, "src");

// Installed macOS fonts with full pt-BR coverage (no font download, no dependency): Charter (a book serif made
// for reading on paper) for the text, Seravek (humanist sans) for titles, labels and tables. Soft ink, generous
// leading and margins, quiet boxes marked by a colored rule instead of filled cards.
const CSS = `
@page { size: A4; margin: 24mm 24mm 22mm; @bottom-center { content: counter(page); font: 9.5pt "Seravek", "Gill Sans", sans-serif; color: #8a8f99; } }
@page :first { @bottom-center { content: none; } }
* { box-sizing: border-box; }
html { font-family: "Charter", "Iowan Old Style", Georgia, serif; font-size: 11pt; line-height: 1.68; color: #3b4150;
  hyphens: none; -webkit-hyphens: none; font-variant-ligatures: none; font-feature-settings: "liga" 0, "clig" 0, "dlig" 0; font-kerning: normal;
  -webkit-font-smoothing: antialiased; }
body { margin: 0; }
.nb { white-space: nowrap; }
.url { overflow-wrap: anywhere; }
p { margin: 0 0 0.85em; orphans: 3; widows: 3; }
strong { font-weight: 700; color: #2a3040; }
h2, h3 { break-after: avoid; line-height: 1.25; font-family: "Seravek", "Gill Sans", "Avenir Next", sans-serif; }
.cover { height: 245mm; display: flex; flex-direction: column; justify-content: center; text-align: left; padding: 0 4mm; }
.cover h1 { font-family: "Seravek", "Gill Sans", sans-serif; font-size: 30pt; font-weight: 600; line-height: 1.15; margin: 0 0 0.5em; color: #22305e; letter-spacing: -0.01em; }
.cover .subtitle { font-family: "Seravek", "Gill Sans", sans-serif; font-size: 13pt; margin: 0 0 3.5em; color: #6b7180; letter-spacing: 0.04em; text-transform: uppercase; }
.cover .note { font-size: 9.5pt; color: #8a8f99; margin: 0; padding-top: 0.8em; border-top: 0.6pt solid #d9dce3; max-width: 70%; }
.toc { break-before: page; }
.toc h2, .part h2 { font-size: 19pt; font-weight: 600; color: #22305e; margin: 0 0 1.2em; }
.toc ol { list-style: none; padding: 0; margin: 0; font-family: "Seravek", "Gill Sans", sans-serif; font-size: 11pt; }
.toc li { display: flex; align-items: baseline; gap: 0.5em; margin: 0 0 0.75em; white-space: nowrap; color: #3b4150; }
.toc-n { min-width: 1.6em; font-weight: 600; color: #4a5a9a; }
.toc-t { flex: none; }
.toc-dots { flex: 1; overflow: hidden; color: #c3c7d0; letter-spacing: 0; }
.toc-p { flex: none; font-variant-numeric: tabular-nums; color: #6b7180; }
.chapter, .part { break-before: page; }
.chapter-title { font-size: 20pt; font-weight: 600; color: #22305e; margin: 0 0 1.2em; padding-bottom: 0.45em; border-bottom: 0.8pt solid #d9dce3; white-space: nowrap; letter-spacing: -0.005em; }
h3 { font-size: 12.5pt; font-weight: 600; color: #2f3d73; margin: 1.6em 0 0.5em; }
ul, ol { margin: 0 0 0.9em; padding-left: 1.4em; }
li { margin: 0 0 0.35em; }
li::marker { color: #8a93b8; }
.box { break-inside: avoid; border-left: 2.4pt solid #8d9be0; background: #f6f7fb; border-radius: 0 3pt 3pt 0; padding: 0.75em 1.1em 0.35em; margin: 1.3em 0; font-size: 10.5pt; }
.box-title { font-family: "Seravek", "Gill Sans", sans-serif; font-weight: 600; font-size: 8.5pt; letter-spacing: 0.12em; text-transform: uppercase; color: #4a5a9a; margin-bottom: 0.45em; }
.box-glossario { border-left-color: #6fa3d8; background: #f4f8fc; }
.box-glossario .box-title { color: #2f6aa3; }
.box-atencao { border-left-color: #e0a066; background: #fdf7f1; }
.box-atencao .box-title { color: #a65a17; }
.box-fonte-historica, .box-experimento { border-left-color: #7cbf93; background: #f4faf6; }
.box-fonte-historica .box-title, .box-experimento .box-title { color: #2f7a4a; }
table { border-collapse: collapse; width: 100%; margin: 1.1em 0 1.3em; break-inside: avoid; font-family: "Seravek", "Gill Sans", sans-serif; font-size: 9.8pt; line-height: 1.45; }
th, td { border-bottom: 0.6pt solid #e1e3ea; padding: 0.5em 0.7em; text-align: left; vertical-align: top; }
th { border-bottom: 1pt solid #b9bfd0; font-weight: 600; color: #22305e; background: none; }
tr:last-child td { border-bottom: 0.8pt solid #b9bfd0; }
code { font-family: Menlo, monospace; font-size: 0.9em; }
`;

// Chapter titles never wrap (the PDF's first line must be the whole "Capítulo N — Título"): shrink the long ones.
const FIT_TITLES = `<script>for (const h of document.querySelectorAll(".chapter-title")) { let s = 20; while (h.scrollWidth > h.clientWidth && s > 11) h.style.fontSize = (s -= 0.5) + "pt"; }</script>`;

function html(book: Book, pages: PageMap): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(book.title)}</title><style>${CSS}</style></head><body>
<section class="cover"><h1>${esc(book.title)}</h1><p class="subtitle">${esc(book.subtitle)}</p><p class="note">${COVER_NOTE}</p></section>
${tocHtml(book, pages)}
${book.body}
${FIT_TITLES}</body></html>`;
}

function printPdf(htmlFile: string, pdfFile: string): void {
  const profile = mkdtempSync(join(tmpdir(), "mento-chrome-"));
  try {
    execFileSync(
      CHROME,
      ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, "--no-pdf-header-footer", `--print-to-pdf=${pdfFile}`, `file://${htmlFile}`],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
  if (!existsSync(pdfFile)) throw new Error(`Chrome did not write ${pdfFile}`);
}

async function pageMap(pdfFile: string, book: Book): Promise<{ map: PageMap; total: number }> {
  const pages = await extractPdfPages(readFileSync(pdfFile));
  const found = findChapterStarts(pages);
  const map = { chapters: book.chapters.map((c) => found.chapters.find((f) => f.n === c.n)?.page ?? null), references: found.references };
  return { map, total: pages.length };
}

async function render(key: string): Promise<void> {
  const source = join(SRC, key, "book.md");
  if (!existsSync(source)) throw new Error(`missing ${source}`);
  const book = parseBook(readFileSync(source, "utf8"));
  for (const w of book.warnings) console.warn(`  ! ${key}: ${w}`);
  const htmlFile = join(MATERIALS, `${key}.html`);
  const pdfFile = join(MATERIALS, `${key}.pdf`);

  let map: PageMap = { chapters: book.chapters.map(() => null), references: null };
  let total = 0;
  for (let pass = 1; pass <= 3; pass++) {
    writeFileSync(htmlFile, html(book, map));
    printPdf(htmlFile, pdfFile);
    const next = await pageMap(pdfFile, book);
    total = next.total;
    const stable = JSON.stringify(next.map) === JSON.stringify(map);
    map = next.map;
    if (stable) break;
    if (pass === 3) console.warn(`  ! ${key}: page numbers did not settle after 3 passes`);
  }
  const missing = book.chapters.filter((_, i) => map.chapters[i] === null);
  if (missing.length) console.warn(`  ! ${key}: chapter heading not found in the PDF text: ${missing.map((c) => c.n).join(", ")}`);
  console.log(`${key}: ${total} pages → ${pdfFile}`);
  book.chapters.forEach((c, i) => console.log(`  p.${map.chapters[i] ?? "?"}  Capítulo ${c.n} — ${c.title}`));
  if (book.hasReferences) console.log(`  p.${map.references ?? "?"}  Referências`);
}

const key = process.argv.slice(2).find((a) => !a.startsWith("--"));
const keys = key ? [key] : readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_") && existsSync(join(SRC, d.name, "book.md"))).map((d) => d.name);
if (!keys.length) console.log("no book.md under materials/src/");
for (const k of keys) await render(k);
