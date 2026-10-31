import { describe, expect, it } from "vitest";
import { paginate, wrapRuns, wrapText } from "./pdf";

// One unit per character; "B" (bold) characters are twice as wide.
const measure = (text: string, font: "R" | "B") => [...text].length * (font === "B" ? 2 : 1);

describe("wrapText", () => {
  it("breaks between words by measured width", () => {
    expect(wrapText("a república romana", "R", 10, measure)).toEqual(["a", "república", "romana"]);
    expect(wrapText("a república romana", "R", 11, measure)).toEqual(["a república", "romana"]);
  });

  it("breaks a word longer than the line instead of overflowing", () => {
    const lines = wrapText("inconstitucionalissimamente", "R", 10, measure);
    expect(lines).toEqual(["inconstitu", "cionalissi", "mamente"]);
    expect(lines.every((l) => measure(l, "R") <= 10)).toBe(true);
  });

  it("counts accented characters as one glyph each", () => {
    expect(wrapText("ação ênfase", "R", 4, measure)).toEqual(["ação", "ênfa", "se"]);
  });
});

describe("wrapRuns", () => {
  it("measures each run with its own font and keeps x offsets", () => {
    const lines = wrapRuns(
      [
        { text: "Resposta: ", font: "B" as const },
        { text: "c) Senado", font: "R" as const },
      ],
      30,
      measure,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]!.map((s) => [s.text, s.x])).toEqual([
      ["Resposta:", 0],
      [" c) Senado", 18],
    ]);
  });

  it("drops the space at the start of a wrapped line", () => {
    const lines = wrapRuns(
      [
        { text: "Por quê: ", font: "B" as const },
        { text: "os plebeus", font: "R" as const },
      ],
      20,
      measure,
    );
    expect(lines.map((l) => l.map((s) => s.text).join(""))).toEqual(["Por quê: os", "plebeus"]);
    expect(lines[1]![0]!.x).toBe(0);
  });
});

describe("paginate", () => {
  const area = { top: 100, bottom: 0 };
  const pageOf = (pages: ReturnType<typeof paginate>, block: number) => [
    ...new Set(pages.flatMap((p, i) => (p.some((r) => r.block === block) ? [i] : []))),
  ];

  it("moves a block that does not fit to the next page whole", () => {
    const pages = paginate(
      [
        { gapBefore: 0, rows: [30, 30] },
        { gapBefore: 10, rows: [20, 20] },
      ],
      area,
    );
    expect(pages).toHaveLength(2);
    expect(pageOf(pages, 1)).toEqual([1]);
    // The gap above a block is dropped at the top of a page.
    expect(pages[1]![0]!.top).toBe(100);
  });

  it("keeps blocks on the same page while they fit, gaps included", () => {
    const pages = paginate(
      [
        { gapBefore: 0, rows: [40] },
        { gapBefore: 10, rows: [25, 25] },
      ],
      area,
    );
    expect(pages).toHaveLength(1);
    expect(pages[0]!.map((r) => r.top)).toEqual([100, 50, 25]);
  });

  it("splits only a block taller than a page, between rows", () => {
    const pages = paginate(
      [
        { gapBefore: 0, rows: [10] },
        { gapBefore: 5, rows: [40, 40, 40] },
      ],
      area,
    );
    expect(pages).toHaveLength(2);
    expect(pages[0]!.filter((r) => r.block === 1)).toHaveLength(2);
    expect(pages[1]!.map((r) => r.row)).toEqual([2]);
  });
});
