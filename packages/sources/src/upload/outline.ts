import type { OutlineItem } from "@mento/contracts";

const HEADING = /^(cap[ií]tulo|unidade|li[cç][aã]o|parte)\s+\d+\b.*/i;

/**
 * Chapter outline: the PDF bookmarks when present; otherwise headings found at the top of pages
 * ("Capítulo 3 — …", "Unidade 2", "Lição 5"); otherwise one section for the whole document.
 */
export function buildOutline(bookmarks: { title: string; page: number }[], pages: string[]): OutlineItem[] {
  const total = pages.length;
  let starts = [...bookmarks];
  if (starts.length === 0) {
    pages.forEach((text, i) => {
      const heading = text
        .split("\n")
        .slice(0, 3)
        .map((l) => l.trim())
        .find((l) => HEADING.test(l));
      if (heading) starts.push({ title: heading, page: i + 1 });
    });
  }
  starts = starts
    .filter((s) => s.page >= 1 && s.page <= total)
    .sort((a, b) => a.page - b.page)
    .filter((s, i, all) => i === 0 || s.page !== all[i - 1]!.page);
  if (starts.length === 0) return total > 0 ? [{ title: "Documento", start_page: 1, end_page: total }] : [];
  return starts.map((s, i) => ({ title: s.title, start_page: s.page, end_page: i + 1 < starts.length ? starts[i + 1]!.page - 1 : total }));
}

export function chapterOf(outline: OutlineItem[], page: number): string | null {
  return outline.find((o) => page >= o.start_page && page <= o.end_page)?.title ?? null;
}
