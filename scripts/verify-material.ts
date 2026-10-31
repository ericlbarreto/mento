// Plan E: check a rendered textbook the way the ingestion will read it, without touching the database.
// Text layer on every page, pt-BR accents decoded, no ligature glyphs, chapter start pages, the `--chapters` string for
// `pnpm ingest`, and what the ingestion (passages, Sumário pages) and the teacher upload (outline) would build from it.
// Usage: pnpm materials:verify materials/<key>.pdf [--dump]
import { readFileSync } from "node:fs";
import { buildOutline, openPdf } from "@mento/sources";
import { chunkPages, cleanPageText, extractPdfPages, isTableOfContents } from "@mento/sources/ingest";
import { chaptersSpec, findChapterStarts, LIGATURES } from "./lib/book";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: pnpm materials:verify materials/<key>.pdf [--dump]");
  process.exit(1);
}
const data = readFileSync(file);
const pages = await extractPdfPages(data);
const problems: string[] = [];
const warnings: string[] = [];

console.log(`${file}: ${pages.length} pages`);
console.log(`chars per page: ${pages.map((p) => `${p.page}:${p.text.length}`).join(" ")}`);
if (process.argv.includes("--dump")) for (const p of pages) console.log(`\n----- page ${p.page} -----\n${p.text}`);

const thin = pages.filter((p) => p.text.replace(/\s/g, "").length < 20).map((p) => p.page);
if (thin.length) problems.push(`pages with fewer than 20 characters (no text layer?): ${thin.join(", ")}`);

const all = pages.map((p) => p.text).join("\n");
if (!all.includes("ção") || !all.includes("ã")) problems.push('"ção"/"ã" not found in the text layer: accents are not decoded');
const decomposed = all.normalize("NFC") !== all;
if (decomposed) warnings.push("text has decomposed accents (NFD): searches would miss them");
if (/�/.test(all)) problems.push("replacement characters (U+FFFD) in the text layer");
const ligaturePages = pages.filter((p) => LIGATURES.test(p.text)).map((p) => p.page);
LIGATURES.lastIndex = 0;
if (ligaturePages.length) warnings.push(`ligature glyphs (ﬁ, ﬂ…) on pages ${ligaturePages.join(", ")}`);

const { chapters, references } = findChapterStarts(pages);
console.log("\nchapters:");
for (const c of chapters) console.log(`  p.${c.page}  Capítulo ${c.n} — ${c.title}`);
if (references) console.log(`  p.${references}  Referências`);
if (!chapters.length) problems.push('no page starts with "Capítulo N — Título"');
chapters.forEach((c, i) => {
  if (c.n !== i + 1) problems.push(`chapter numbers out of order at page ${c.page} (Capítulo ${c.n})`);
});
const spec = chaptersSpec(chapters, pages.length, references);
console.log(`\n--chapters="${spec}"`);

// Same steps as `ingestPdf` before embedding (no DB, no Voyage).
const cleaned = pages.map((p) => ({ page: p.page, text: cleanPageText(p.text) }));
const toc = cleaned.filter((p) => isTableOfContents(p.text)).map((p) => p.page);
const passages = chunkPages(cleaned.filter((p) => !toc.includes(p.page)));
const avg = passages.length ? Math.round(passages.reduce((s, p) => s + p.text.length, 0) / passages.length) : 0;
console.log(`\ningest dry run: ${passages.length} passages (avg ${avg} chars), Sumário pages left out: ${toc.join(", ") || "none"}`);
if (!toc.length) warnings.push("no page is detected as the Sumário (it would be searched like a lesson page)");

// Same outline as the teacher upload (POST /api/materials): PDF bookmarks, else headings at the top of pages.
const pdf = await openPdf(data);
const bookmarks = await pdf.outline();
const texts: string[] = [];
for (let n = 1; n <= pdf.pageCount; n++) texts.push(await pdf.pageText(n));
const outline = buildOutline(bookmarks, texts);
console.log(`upload outline (${bookmarks.length ? "bookmarks" : "page headings"}): ${outline.map((o) => `${o.title} ${o.start_page}-${o.end_page}`).join(" | ")}`);

for (const w of warnings) console.log(`WARNING: ${w}`);
for (const p of problems) console.log(`FAIL: ${p}`);
if (problems.length) process.exit(1);
console.log("OK");
