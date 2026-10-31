export interface Passage {
  page: number;
  passage_idx: number;
  text: string;
}

export interface ChunkOptions {
  /** Close a passage once it has about this many characters (~400 tokens). */
  targetChars?: number;
  /** A single sentence longer than this is split by words. */
  maxChars?: number;
  /** The last sentence of a passage is repeated at the start of the next when it is at most this long. */
  overlapChars?: number;
}

const SENTENCE_END = /(?<=[.!?…])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9"“(])/;

const splitSentences = (text: string): string[] =>
  text.split(SENTENCE_END).map((s) => s.trim()).filter(Boolean);

function splitByWords(sentence: string, max: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of sentence.split(" ")) {
    if (current && current.length + 1 + word.length > max) {
      out.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Split page texts into passages of about `targetChars`, never crossing a page, cutting at sentence ends.
 * Pages with almost no text produce no passage (the ingestion reports them as empty).
 */
export function chunkPages(pages: { page: number; text: string }[], opts: ChunkOptions = {}): Passage[] {
  const { targetChars = 1600, maxChars = 2200, overlapChars = 200 } = opts;
  const passages: Passage[] = [];

  for (const { page, text } of pages) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length < 20) continue;
    const sentences = splitSentences(clean).flatMap((s) => (s.length > maxChars ? splitByWords(s, maxChars) : [s]));

    let index = 0;
    let current: string[] = [];
    let fresh = 0; // sentences added since the last passage was closed (the carried overlap does not count)
    const close = () => {
      passages.push({ page, passage_idx: index++, text: current.join(" ") });
      const last = current[current.length - 1] as string;
      current = last.length <= overlapChars ? [last] : [];
      fresh = 0;
    };

    for (const sentence of sentences) {
      if (fresh > 0 && current.join(" ").length + 1 + sentence.length > targetChars) close();
      current.push(sentence);
      fresh++;
    }
    if (fresh > 0) passages.push({ page, passage_idx: index++, text: current.join(" ") });
  }
  return passages;
}

/** Title of the chapter that contains `page`, if the outline has one. */
export function chapterForPage(chapters: { title: string; start_page: number; end_page: number }[], page: number): string | undefined {
  return chapters.find((c) => page >= c.start_page && page <= c.end_page)?.title;
}
