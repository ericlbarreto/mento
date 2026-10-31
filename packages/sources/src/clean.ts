// Hyphen-like characters PDFs use at line ends: non-breaking hyphen (U+2011), soft hyphen (U+00AD), ASCII.
const LINE_BREAK_HYPHEN = /(\p{L})[ \t]*[‑­-][ \t]*\n[ \t]*(\p{L})/gu;
const INLINE_HYPHEN = /[ \t]*‑[ \t]*/g;

/** A line that is only a printed page number (often letter-spaced, "3 2 9") or punctuation. */
const PAGE_NUMBER_LINE = /^[\d\s.]*$/;

/** Headings typeset with spaced letters ("e x p a n S ã o") come out as runs of one-letter tokens. */
function isLetterSpaced(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 6) return false;
  const single = tokens.filter((t) => t.length === 1).length;
  return single / tokens.length >= 0.6;
}

/**
 * Repair the text layer of a PDF page before chunking: join words split at line ends, normalize
 * compound-word hyphens, and drop page-number and letter-spaced heading lines. Keeps line breaks.
 */
export function cleanPageText(text: string): string {
  return text
    .replace(LINE_BREAK_HYPHEN, "$1$2")
    .replace(INLINE_HYPHEN, "-")
    .replace(/­/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line && !PAGE_NUMBER_LINE.test(line) && !isLetterSpaced(line))
    .join("\n");
}

/** A table of contents: several dot leaders ("Prefácio ........ 11"). Not useful as a teaching passage. */
export function isTableOfContents(text: string): boolean {
  return (text.match(/\.{8,}/g) ?? []).length >= 3;
}
