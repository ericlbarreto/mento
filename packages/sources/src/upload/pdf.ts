import { getDocumentProxy } from "unpdf";

export interface PdfDoc {
  pageCount: number;
  /** Text layer of one page (1-based). Empty for scanned pages. */
  pageText(page: number): Promise<string>;
  /** Top-level bookmarks resolved to pages; `[]` when the PDF has none. */
  outline(): Promise<{ title: string; page: number }[]>;
}

/** Opens a PDF from memory. Throws when the bytes are not a readable PDF. */
export async function openPdf(data: Buffer): Promise<PdfDoc> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  return {
    pageCount: pdf.numPages,
    async pageText(page) {
      const content = await (await pdf.getPage(page)).getTextContent();
      return content.items
        .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : ""))
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
    },
    async outline() {
      try {
        const items = (await pdf.getOutline()) ?? [];
        const out: { title: string; page: number }[] = [];
        for (const item of items) {
          const dest = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
          const ref = Array.isArray(dest) ? dest[0] : null;
          if (ref === null || ref === undefined) continue;
          const index = typeof ref === "number" ? ref : await pdf.getPageIndex(ref);
          out.push({ title: item.title.trim(), page: index + 1 });
        }
        return out;
      } catch {
        return [];
      }
    },
  };
}
