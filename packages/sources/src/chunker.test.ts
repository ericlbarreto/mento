import { describe, expect, it } from "vitest";
import { chapterForPage, chunkPages } from "./chunker";

const sentence = (n: number) => `Esta é a frase número ${n} sobre a história de Roma antiga e suas instituições.`;
const longPage = (count: number) => Array.from({ length: count }, (_, i) => sentence(i + 1)).join(" ");

describe("chunkPages", () => {
  it("keeps a short page as one passage and skips pages with almost no text", () => {
    const out = chunkPages([{ page: 3, text: "A República romana começou em 509 a.C. Ela terminou em 27 a.C." }, { page: 4, text: "  12 " }, { page: 5, text: "" }]);
    expect(out).toEqual([{ page: 3, passage_idx: 0, text: "A República romana começou em 509 a.C. Ela terminou em 27 a.C." }]);
  });

  it("splits a long page at sentence ends, never crosses pages, and numbers passages per page", () => {
    const out = chunkPages([{ page: 1, text: longPage(60) }, { page: 2, text: longPage(3) }], { targetChars: 500, maxChars: 800, overlapChars: 200 });
    const page1 = out.filter((p) => p.page === 1);
    expect(page1.length).toBeGreaterThan(3);
    expect(page1.map((p) => p.passage_idx)).toEqual(page1.map((_, i) => i));
    for (const p of page1) {
      expect(p.text.length).toBeLessThanOrEqual(800 + 200);
      expect(p.text.endsWith(".")).toBe(true);
      expect(p.text.startsWith("Esta é a frase número")).toBe(true);
    }
    expect(out.filter((p) => p.page === 2)).toHaveLength(1);
    // consecutive passages share the last sentence (overlap)
    const lastOfFirst = page1[0]!.text.split(/(?<=\.)\s/).at(-1);
    expect(page1[1]!.text.startsWith(lastOfFirst as string)).toBe(true);
  });

  it("does not emit a passage made only of the carried overlap, and splits a huge sentence by words", () => {
    const out = chunkPages([{ page: 1, text: longPage(8) }], { targetChars: 400, maxChars: 600, overlapChars: 200 });
    const all = out.map((p) => p.text).join(" ");
    for (let n = 1; n <= 8; n++) expect(all).toContain(sentence(n));
    expect(out.at(-1)!.text).not.toBe(out.at(-2)!.text.split(/(?<=\.)\s/).at(-1));

    const huge = `Começo ${"palavra ".repeat(400)}fim.`;
    const split = chunkPages([{ page: 1, text: huge }], { targetChars: 500, maxChars: 600, overlapChars: 0 });
    expect(split.length).toBeGreaterThan(3);
    for (const p of split) expect(p.text.length).toBeLessThanOrEqual(600);
  });
});

describe("chapterForPage", () => {
  const chapters = [{ title: "A República", start_page: 1, end_page: 40 }, { title: "O Império", start_page: 41, end_page: 90 }];
  it("finds the chapter containing the page", () => {
    expect(chapterForPage(chapters, 12)).toBe("A República");
    expect(chapterForPage(chapters, 41)).toBe("O Império");
    expect(chapterForPage(chapters, 120)).toBeUndefined();
    expect(chapterForPage([], 1)).toBeUndefined();
  });
});
