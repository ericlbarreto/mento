// Owner: Person 1. Chapters from the PRINTED table of contents, for books whose PDF has no bookmarks and no
// "Capítulo N" headings. A contents line looks like `3. Da Monarquia à República ........ 53`, but the numbers restart
// inside every chapter (1., 2., 3.… are also its sections), so the numbering alone cannot tell a chapter from a section.
// What does: a real chapter starts a page. Once the offset between the printed page number and the PDF page is known,
// an entry is a chapter when the page it points to opens like one: the title at the top, or (anthologies, where the
// heading is a graphic) an author / "Sumário" / DOI block. Entries that point into the middle of a page are sections.
import type { OutlineItem } from "@mento/contracts";
import { normalizeConcept } from "@mento/contracts";

/** Dot leaders, then the printed page: `Title ........ 53`. */
const LEADER = /^(.*?)[\s.·…]*\.{3,}[\s.·…]*(\d{1,4})\s*$/;
/** Top-level entry of the contents: `3. Title`. Sections (`3.1.`) do not match. */
const NUMBERED = /^(\d{1,2})\.\s+(\S.*)$/;

export interface TocEntry {
  number: number;
  /** Title as printed, without the author in parentheses. */
  title: string;
  /** Printed page number (not the PDF page). */
  printedPage: number;
}

const words = (s: string, n: number) => normalizeConcept(s).split(" ").filter(Boolean).slice(0, n).join(" ");
const cleanTitle = (s: string) => s.replace(/\s*\(.*$/, "").replace(/[\s.·…]+$/, "").trim();

/** The numbered entries of the contents pages, in order. Titles wrapped over two lines are joined. */
export function parseTocEntries(pages: string[], maxPages = 30): TocEntry[] {
  const entries: TocEntry[] = [];
  let buffer = "";
  for (const text of pages.slice(0, maxPages)) {
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const m = LEADER.exec(line);
      if (!m) {
        // A title that wraps: keep the first line, the leaders come on the next one.
        buffer = buffer ? `${buffer} ${line}` : line;
        if (buffer.length > 240) buffer = "";
        continue;
      }
      const head = (buffer ? `${buffer} ${m[1]}` : (m[1] ?? "")).trim();
      buffer = "";
      const n = NUMBERED.exec(head);
      if (n) entries.push({ number: Number(n[1]), title: cleanTitle(n[2] ?? ""), printedPage: Number(m[2]) });
    }
    buffer = ""; // a title never wraps across pages
  }
  return entries;
}

/** True when the title opens the page: it is in the first lines (a chapter heading), not buried in the text. */
function opensPage(page: string | undefined, title: string, lines = 4): boolean {
  if (!page) return false;
  const key = words(title, 5);
  if (!key) return false;
  const head = normalizeConcept(page.split("\n").slice(0, lines).join(" "));
  return head.includes(key);
}

/** The first lines of a chapter opener in an anthology: abstract, author affiliation, DOI. */
const OPENER = /\b(sumario|resumo|abstract|doi|universidade|university|faculdade|instituto)\b/;
const hasOpener = (page: string | undefined, lines = 8) => !!page && OPENER.test(normalizeConcept(page.split("\n").slice(0, lines).join(" ")));

/**
 * Chapters from the printed contents, or [] when the book does not have one we can trust (fewer than 3 chapters
 * confirmed against the pages). `pages[i]` is the cleaned text of PDF page i + 1.
 */
export function outlineFromToc(pages: string[]): OutlineItem[] {
  const entries = parseTocEntries(pages).filter((e) => e.title.length >= 3);
  if (entries.length < 3) return [];
  const lastTocPage = Math.max(0, ...pages.slice(0, 30).flatMap((p, i) => (LEADER.test(p.split("\n").find((l) => LEADER.test(l)) ?? "") ? [i + 1] : [])));

  // The offset between printed and PDF page: the most common one among entries whose title opens a later PDF page.
  const votes = new Map<number, number>();
  for (const e of entries) {
    for (let p = lastTocPage + 1; p <= pages.length; p++) {
      if (opensPage(pages[p - 1], e.title)) {
        const off = p - e.printedPage;
        votes.set(off, (votes.get(off) ?? 0) + 1);
        break; // the first page where the title opens is the heading
      }
    }
  }
  const offset = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (offset === undefined) return [];

  const pdfPageOf = (e: TocEntry) => e.printedPage + offset;
  const inBody = (e: TocEntry) => pdfPageOf(e) > lastTocPage && pdfPageOf(e) <= pages.length;
  const byOpener = entries.filter((e) => inBody(e) && hasOpener(pages[pdfPageOf(e) - 1]));
  const byTitle = entries.filter((e) => inBody(e) && opensPage(pages[pdfPageOf(e) - 1], e.title));
  // When several entries point to openers, that is the book's pattern (an anthology): use only those.
  const confirmed = byOpener.length >= 3 ? byOpener : byTitle;

  // A chapter list has pages in increasing order and one chapter per page (the first entry of a page is the chapter).
  const chapters: { title: string; page: number }[] = [];
  for (const e of confirmed) {
    const page = pdfPageOf(e);
    if (chapters.length === 0 || page > chapters[chapters.length - 1]!.page) chapters.push({ title: `${e.number}. ${e.title}`, page });
  }
  if (chapters.length < 3) return [];
  return chapters.map((c, i) => ({ title: c.title, start_page: c.page, end_page: i + 1 < chapters.length ? chapters[i + 1]!.page - 1 : pages.length }));
}
