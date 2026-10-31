import { normalizeConcept } from "@mento/contracts";

/** Accent-, case- and whitespace-insensitive form used for search and citation checks. */
export const normalizeSearchText = normalizeConcept;

/**
 * Splits one page into chunks of at most `maxChars`: paragraphs first, then sentences, then a hard cut.
 * Short pages stay as a single chunk.
 */
export function chunkPage(text: string, maxChars = 1500): string[] {
  const clean = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const pieces: string[] = [];
  for (const paragraph of clean.split(/\n\s*\n/)) {
    if (paragraph.length <= maxChars) pieces.push(paragraph.trim());
    else {
      for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
        if (sentence.length <= maxChars) pieces.push(sentence.trim());
        else for (let i = 0; i < sentence.length; i += maxChars) pieces.push(sentence.slice(i, i + maxChars).trim());
      }
    }
  }
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces.filter(Boolean)) {
    if (current && current.length + piece.length + 1 > maxChars) {
      chunks.push(current);
      current = piece;
    } else current = current ? `${current}\n${piece}` : piece;
  }
  if (current) chunks.push(current);
  return chunks;
}
