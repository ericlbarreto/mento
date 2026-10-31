import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface PdfPage {
  page: number;
  text: string;
}

/** Text layer of every page of a PDF (1-based page numbers). Pages without a text layer come back with empty text. */
export async function extractPdfPages(data: Uint8Array, onPage?: (done: number, total: number) => void): Promise<PdfPage[]> {
  const task = getDocument({ data: new Uint8Array(data), useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join("").replace(/[ \t]+/g, " ").trim();
      pages.push({ page: n, text });
      page.cleanup();
      onPage?.(n, doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return pages;
}
