// Pure helpers for the demo textbooks (Plan E): the Markdown subset of materials/src/WRITING-BRIEF.md → print HTML,
// and chapter detection on the extracted PDF text. No I/O here, so they are unit-tested (book.test.ts).

export const COVER_NOTE = "Material original produzido pela equipe Mento com apoio de IA, para demonstração.";

/** `## Capítulo 3 — Título` in the Markdown; the same text is the first line of the chapter's page in the PDF. */
const CHAPTER_HEADING = /^Capítulo (\d+) — (.+)$/;

export interface BookChapter {
  n: number;
  title: string;
}

export interface Book {
  title: string;
  subtitle: string;
  chapters: BookChapter[];
  /** Chapter lines listed under `## Sumário` (only compared with the real chapters). */
  summary: string[];
  hasReferences: boolean;
  /** Body HTML (everything after the Sumário). */
  body: string;
  warnings: string[];
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Inline Markdown: **bold**, *italic*, `code`, [text](url), <url>. Words joined by a hyphen ("guarda-chuva") never break
 * at the hyphen: the ingestion joins "letter-\nletter" as a word split at a line end and would drop the hyphen.
 */
export function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 (<span class="url">$2</span>)')
    .replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<span class="url">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\p{L}])\*(?!\s)(.+?)\*(?!\p{L})/gu, "$1<em>$2</em>")
    .replace(/\p{L}+(?:-\p{L}+)+/gu, (w) => `<span class="nb">${w}</span>`);
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const TABLE_SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

/** Block-level Markdown (paragraphs, ###, lists, tables, blockquote boxes) → HTML. `##` is handled by `parseBook`. */
export function blocks(lines: string[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      out.push(`<h3>${inline(line.slice(4).trim())}</h3>`);
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const inner: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) inner.push(lines[i++]!.replace(/^>\s?/, ""));
      out.push(box(inner));
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) rows.push(lines[i++]!);
      out.push(table(rows));
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      const start = ordered ? Number(/\d+/.exec(line)![0]) : 1;
      while (i < lines.length && lines[i]!.trim()) {
        const m = LIST_ITEM.exec(lines[i]!);
        if (m) items.push(m[3]!);
        else if (items.length) items[items.length - 1] += ` ${lines[i]!.trim()}`;
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ""}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(###\s|>|\|)/.test(lines[i]!.trim()) && !LIST_ITEM.test(lines[i]!)) para.push(lines[i++]!.trim());
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

/** `> **Você sabia?** text` → a styled box whose title is the bold label. A blockquote without a label is a plain box. */
function box(inner: string[]): string {
  const first = inner.findIndex((l) => l.trim());
  const m = first >= 0 ? /^\*\*(.+?)\*\*\s*(.*)$/.exec(inner[first]!.trim()) : null;
  if (!m) return `<aside class="box">${blocks(inner)}</aside>`;
  const label = m[1]!.trim();
  // Inside a box, a line that starts with a bold term ("**Potência**: …") is its own paragraph (glossary entries).
  const rest = inner.flatMap((l, i) => (i > first && l.trim().startsWith("**") ? ["", l] : [l]));
  rest[first] = m[2]!;
  return `<aside class="box box-${slug(label)}"><div class="box-title">${inline(label)}</div>${blocks(rest)}</aside>`;
}

function table(rows: string[]): string {
  const [head, sep, ...body] = rows;
  if (!head) return "";
  const hasHeader = sep !== undefined && TABLE_SEPARATOR.test(sep.trim());
  const bodyRows = hasHeader ? body : rows;
  const th = hasHeader ? `<thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` : "";
  const tb = bodyRows.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("");
  return `<table>${th}<tbody>${tb}</tbody></table>`;
}

/** Split a book.md into cover data, Sumário entries and the body HTML (one `<section>` per `##`). */
export function parseBook(markdown: string): Book {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const warnings: string[] = [];
  let i = lines.findIndex((l) => l.trim());
  const titleLine = lines[i] ?? "";
  if (!titleLine.startsWith("# ")) warnings.push('line 1 must be "# <Book title>"');
  const title = titleLine.replace(/^#\s+/, "").trim();
  i++;
  while (i < lines.length && !lines[i]!.trim()) i++;
  const subtitle = lines[i] && !lines[i]!.startsWith("#") ? lines[i++]!.trim() : "";
  if (!subtitle) warnings.push("missing subtitle line after the title");

  const sections: { heading: string; lines: string[] }[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("## ")) sections.push({ heading: line.slice(3).trim(), lines: [] });
    else if (line.startsWith("# ")) warnings.push(`extra "# " heading ignored: ${line}`);
    else if (sections.length) sections[sections.length - 1]!.lines.push(line);
    else if (line.trim()) warnings.push(`text before the first "##" ignored: ${line.slice(0, 60)}`);
  }

  const chapters: BookChapter[] = [];
  let summary: string[] = [];
  let hasReferences = false;
  const body: string[] = [];
  for (const s of sections) {
    if (s.heading === "Sumário") {
      summary = s.lines.map((l) => l.replace(/^\s*[-*]\s+/, "").trim()).filter(Boolean);
      continue;
    }
    const ch = CHAPTER_HEADING.exec(s.heading);
    if (ch) {
      const chapter = { n: Number(ch[1]), title: ch[2]!.trim() };
      if (chapter.title.includes(";") || chapter.title.includes(":")) warnings.push(`chapter ${chapter.n}: no ";" or ":" in titles (the --chapters string uses them)`);
      if (chapters.length && chapter.n !== chapters[chapters.length - 1]!.n + 1) warnings.push(`chapter ${chapter.n} does not follow chapter ${chapters[chapters.length - 1]!.n}`);
      chapters.push(chapter);
      body.push(`<section class="chapter"><h2 class="chapter-title">${escapeHtml(s.heading)}</h2>\n${blocks(s.lines)}</section>`);
      continue;
    }
    if (/^Cap[ií]tulo\b/i.test(s.heading)) warnings.push(`heading "${s.heading}" is not "Capítulo N — Título" (em dash)`);
    if (s.heading === "Referências") hasReferences = true;
    body.push(`<section class="part"><h2>${inline(s.heading)}</h2>\n${blocks(s.lines)}</section>`);
  }
  const expected = chapters.map((c) => `Capítulo ${c.n} — ${c.title}`);
  if (summary.length && summary.join("\n") !== expected.join("\n")) warnings.push("the Sumário list does not match the chapter headings (the rendered Sumário uses the headings)");
  if (!chapters.length) warnings.push('no "## Capítulo N — Título" heading found');
  if (!hasReferences) warnings.push('missing "## Referências" section');
  return { title, subtitle, chapters, summary, hasReferences, body: body.join("\n"), warnings };
}

/** Page where each chapter starts (`null` while unknown) and where the references start. */
export interface PageMap {
  chapters: (number | null)[];
  references: number | null;
}

/**
 * Dotted Sumário. Entries are "N  Título ...... p" without the word "Capítulo", so no line of this page looks like a
 * chapter heading to the upload's outline (`buildOutline`) or to `findChapterStarts`.
 */
export function tocHtml(book: Book, pages: PageMap): string {
  const num = (p: number | null) => (p === null ? "00" : String(p));
  const dots = ".".repeat(200);
  const entry = (label: string, title: string, page: number | null) =>
    `<li><span class="toc-n">${label}</span><span class="toc-t">${inline(title)}</span><span class="toc-dots">${dots}</span><span class="toc-p">${num(page)}</span></li>`;
  const items = book.chapters.map((c, i) => entry(String(c.n), c.title, pages.chapters[i] ?? null));
  if (book.hasReferences) items.push(entry("", "Referências", pages.references));
  return `<section class="toc"><h2>Sumário</h2><ol>${items.join("")}</ol></section>`;
}

export interface ChapterStart {
  n: number;
  title: string;
  page: number;
}

/** Chapter start pages in extracted PDF text: a line "Capítulo N — Título" among the first 3 lines of a page. */
export function findChapterStarts(pages: { page: number; text: string }[]): { chapters: ChapterStart[]; references: number | null } {
  const chapters: ChapterStart[] = [];
  let references: number | null = null;
  for (const p of pages) {
    const top = p.text
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 3);
    for (const line of top) {
      const m = CHAPTER_HEADING.exec(line);
      if (m) {
        chapters.push({ n: Number(m[1]), title: m[2]!.trim(), page: p.page });
        break;
      }
      if (line === "Referências" && references === null) references = p.page;
    }
  }
  return { chapters, references };
}

/** `--chapters="Título:start-end;…"` for `pnpm ingest`. The last chapter ends before the references (or at the last page). */
export function chaptersSpec(starts: ChapterStart[], totalPages: number, references: number | null): string {
  return starts
    .map((c, i) => {
      const next = starts[i + 1]?.page ?? (references ?? totalPages + 1);
      return `${c.title}:${c.page}-${Math.max(c.page, next - 1)}`;
    })
    .join(";");
}

/** Typographic ligature code points (U+FB00–FB06): the ingestion would store "ﬁ" instead of "fi". */
export const LIGATURES = /[ﬀ-ﬆ]/g;

/** Backup file for `remove-material`: materials/backups/<id>-<timestamp>.json (timestamp safe for file names). */
export function backupFileName(id: string, now: Date): string {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error(`not a material id: ${id}`);
  return `${id}-${now.toISOString().replace(/[:.]/g, "-")}.json`;
}
