import { describe, expect, it } from "vitest";
import { backupFileName, blocks, chaptersSpec, findChapterStarts, inline, parseBook, tocHtml } from "./book";

const BOOK = `# Livro
Ciências da Natureza · 8º ano

## Sumário
- Capítulo 1 — Energia
- Capítulo 2 — Circuitos

## Capítulo 1 — Energia
Texto com **termo**.

## Capítulo 2 — Circuitos
> **Glossário** **Corrente**: fluxo de cargas.
> **Tensão**: diferença de potencial.

## Referências
- Fonte. <https://example.org>
`;

describe("parseBook", () => {
  it("reads cover, chapters and references without warnings", () => {
    const book = parseBook(BOOK);
    expect(book.title).toBe("Livro");
    expect(book.subtitle).toBe("Ciências da Natureza · 8º ano");
    expect(book.chapters).toEqual([{ n: 1, title: "Energia" }, { n: 2, title: "Circuitos" }]);
    expect(book.hasReferences).toBe(true);
    expect(book.warnings).toEqual([]);
    expect(book.body).toContain('<h2 class="chapter-title">Capítulo 1 — Energia</h2>');
    expect(book.body).toContain('<aside class="box box-glossario"><div class="box-title">Glossário</div>');
    expect(book.body).toContain("<p><strong>Tensão</strong>: diferença de potencial.</p>");
  });

  it("warns about a chapter heading without the em dash and a Sumário that does not match", () => {
    const book = parseBook(BOOK.replace("## Capítulo 2 — Circuitos", "## Capítulo 2 - Circuitos"));
    expect(book.warnings.some((w) => w.includes("em dash"))).toBe(true);
    expect(book.warnings.some((w) => w.includes("Sumário"))).toBe(true);
  });
});

describe("inline and blocks", () => {
  it("keeps hyphenated words on one line and escapes HTML", () => {
    expect(inline("um guarda-chuva <b>")).toBe('um <span class="nb">guarda-chuva</span> &lt;b&gt;');
  });
  it("renders a timeline table and an ordered list", () => {
    const html = blocks(["| Ano | Acontecimento |", "|---|---|", "| 1822 | Independência |", "", "1. Um", "2. Dois"]);
    expect(html).toContain("<thead><tr><th>Ano</th><th>Acontecimento</th></tr></thead><tbody><tr><td>1822</td>");
    expect(html).toContain("<ol><li>Um</li><li>Dois</li></ol>");
  });
});

describe("tocHtml", () => {
  it("prints dot leaders and page numbers without the word Capítulo", () => {
    const html = tocHtml(parseBook(BOOK), { chapters: [3, 9], references: 14 });
    expect(html).not.toContain("Capítulo");
    expect(html).toMatch(/\.{8,}<\/span><span class="toc-p">9</);
    expect(html).toContain('<span class="toc-p">14</span>');
  });
});

describe("findChapterStarts and chaptersSpec", () => {
  const pages = [
    { page: 1, text: "Livro\nCiências" },
    { page: 2, text: "2\nSumário\n1 Energia ........ 3" },
    { page: 3, text: "3\nCapítulo 1 — Energia\nTexto" },
    { page: 4, text: "4\nTexto que cita o Capítulo 2 — Circuitos no meio" },
    { page: 5, text: "5\nCapítulo 2 — Circuitos\nTexto" },
    { page: 6, text: "6\nTexto" },
    { page: 7, text: "7\nReferências\nFonte" },
  ];
  it("finds headings among the first lines of a page only", () => {
    const found = findChapterStarts(pages);
    expect(found.chapters).toEqual([{ n: 1, title: "Energia", page: 3 }, { n: 2, title: "Circuitos", page: 5 }]);
    expect(found.references).toBe(7);
  });
  it("ends the last chapter before the references, or at the last page", () => {
    const { chapters, references } = findChapterStarts(pages);
    expect(chaptersSpec(chapters, 7, references)).toBe("Energia:3-4;Circuitos:5-6");
    expect(chaptersSpec(chapters, 7, null)).toBe("Energia:3-4;Circuitos:5-7");
  });
});

describe("backupFileName", () => {
  it("names the backup by id and a file-safe timestamp", () => {
    expect(backupFileName("65a1b2c3d4e5f60718293a4b", new Date("2026-10-31T12:34:56.789Z"))).toBe("65a1b2c3d4e5f60718293a4b-2026-10-31T12-34-56-789Z.json");
  });
  it("rejects anything that is not a material id", () => {
    expect(() => backupFileName("../../etc", new Date())).toThrow();
  });
});
