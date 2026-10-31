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

// Installed macOS fonts with full pt-BR coverage (no font download, no dependency): Avenir Next for the text,
// Noteworthy (handwritten, close to the board's Caveat) for box titles only.
const CSS = `
@page { size: A4; margin: 20mm 19mm 18mm; @bottom-center { content: counter(page); font: 10pt "Avenir Next", sans-serif; color: #555; } }
@page :first { @bottom-center { content: none; } }
* { box-sizing: border-box; }
html { font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif; font-size: 11.5pt; line-height: 1.55; color: #1f2328;
  hyphens: none; -webkit-hyphens: none; font-variant-ligatures: none; font-feature-settings: "liga" 0, "clig" 0, "dlig" 0; font-kerning: normal; }
body { margin: 0; }
.nb { white-space: nowrap; }
.url { overflow-wrap: anywhere; }
p { margin: 0 0 0.6em; orphans: 3; widows: 3; }
strong { font-weight: 600; }
h2, h3 { break-after: avoid; line-height: 1.25; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; text-align: center; }
.cover h1 { font-size: 30pt; font-weight: 700; margin: 0 0 0.4em; color: #3b2a8a; }
.cover .subtitle { font-size: 15pt; margin: 0 0 3em; color: #444; }
.cover .note { font-size: 10pt; color: #555; margin: 0; }
.toc { break-before: page; }
.toc h2, .part h2 { font-size: 20pt; color: #3b2a8a; margin: 0 0 0.8em; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc li { display: flex; align-items: baseline; gap: 0.4em; margin: 0 0 0.55em; white-space: nowrap; }
.toc-n { min-width: 1.4em; font-weight: 600; }
.toc-t { flex: none; }
.toc-dots { flex: 1; overflow: hidden; color: #888; letter-spacing: 0.1em; }
.toc-p { flex: none; font-variant-numeric: tabular-nums; }
.chapter, .part { break-before: page; }
.chapter-title { font-size: 21pt; font-weight: 700; color: #3b2a8a; margin: 0 0 0.9em; white-space: nowrap; }
h3 { font-size: 13.5pt; font-weight: 600; color: #2d2470; margin: 1.1em 0 0.4em; }
ul, ol { margin: 0 0 0.7em; padding-left: 1.5em; }
li { margin: 0 0 0.25em; }
.box { break-inside: avoid; border: 1.2pt solid #c9c2ef; background: #f5f3ff; border-radius: 6pt; padding: 0.6em 0.9em 0.3em; margin: 0.9em 0; }
.box-title { font-family: "Noteworthy", "Avenir Next", sans-serif; font-weight: 700; font-size: 13pt; color: #3b2a8a; margin-bottom: 0.2em; }
.box-glossario { background: #f3f8ff; border-color: #b9d3f5; }
.box-glossario .box-title { color: #1d4f91; }
.box-atencao { background: #fff6ed; border-color: #f2c79b; }
.box-atencao .box-title { color: #9a4a00; }
.box-fonte-historica, .box-experimento { background: #f2faf4; border-color: #b8dfc3; }
.box-fonte-historica .box-title, .box-experimento .box-title { color: #1e6b37; }
table { border-collapse: collapse; width: 100%; margin: 0.8em 0 1em; break-inside: avoid; font-size: 10.5pt; }
th, td { border: 0.8pt solid #c8c8d0; padding: 0.35em 0.6em; text-align: left; vertical-align: top; }
th { background: #eeecf8; font-weight: 600; }
code { font-family: Menlo, monospace; font-size: 0.9em; }
`;

// Chapter titles never wrap (the PDF's first line must be the whole "Capítulo N — Título"): shrink the long ones.
const FIT_TITLES = `<script>for (const h of document.querySelectorAll(".chapter-title")) { let s = 21; while (h.scrollWidth > h.clientWidth && s > 11) h.style.fontSize = (s -= 0.5) + "pt"; }</script>`;

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
