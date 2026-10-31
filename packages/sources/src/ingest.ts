import type { ChunkStore, MaterialRecord } from "@mento/contracts";
import { chapterForPage, chunkPages } from "./chunker";
import { cleanPageText, isTableOfContents } from "./clean";
import { extractPdfPages } from "./pdf";
import type { Embed } from "./voyage";

export interface IngestInput {
  data: Uint8Array;
  title: string;
  subject: string;
  chapters?: MaterialRecord["chapters"];
  store: ChunkStore;
  embed: Embed;
  log?: (message: string) => void;
}

export interface IngestReport {
  material_id: string;
  pages: number;
  passages: number;
  /** Pages with (almost) no text layer: they need OCR before they can be searched. */
  empty_pages: number[];
  /** Table-of-contents pages, left out of the search (they match every question and teach nothing). */
  toc_pages: number[];
}

/** PDF → text per page → passages → embeddings → stored with the material. Marks the material failed on error. */
export async function ingestPdf(input: IngestInput): Promise<IngestReport> {
  const { data, title, subject, store, embed, log } = input;
  const chapters = input.chapters ?? [];
  const pages = (await extractPdfPages(data)).map((p) => ({ page: p.page, text: cleanPageText(p.text) }));
  const { id } = await store.createMaterial({ title, subject, chapters, pages: pages.length, status: "processing" });
  try {
    const empty_pages = pages.filter((p) => p.text.replace(/\s/g, "").length < 20).map((p) => p.page);
    if (empty_pages.length) log?.(`${empty_pages.length} page(s) without a text layer: ${empty_pages.slice(0, 10).join(", ")}${empty_pages.length > 10 ? "…" : ""}`);
    const toc_pages = pages.filter((p) => isTableOfContents(p.text)).map((p) => p.page);
    const passages = chunkPages(pages.filter((p) => !toc_pages.includes(p.page)));
    log?.(`${pages.length} pages → ${passages.length} passages; embedding…`);
    const vectors = await embed(passages.map((p) => p.text), "document");
    await store.insertPassages(
      passages.map((p, i) => ({
        material_id: id,
        subject,
        chapter: chapterForPage(chapters, p.page),
        page: p.page,
        passage_idx: p.passage_idx,
        text: p.text,
        embedding: vectors[i] as number[],
      })),
    );
    await store.updateMaterial(id, { status: "ready" });
    return { material_id: id, pages: pages.length, passages: passages.length, empty_pages, toc_pages };
  } catch (err) {
    await store.updateMaterial(id, { status: "failed" });
    throw err;
  }
}
