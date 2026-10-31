import { describe, expect, it } from "vitest";
import { AlignmentAccumulator, charsToWords, fromHttpAlignment, fromStreamAlignment, pcmDurationMs } from "./alignment";

describe("fromHttpAlignment", () => {
  it("converts seconds to integer milliseconds", () => {
    const chars = fromHttpAlignment({
      characters: ["O", "i"],
      character_start_times_seconds: [0, 0.0804],
      character_end_times_seconds: [0.0804, 0.1599],
    });
    expect(chars).toEqual([
      { char: "O", start_ms: 0, end_ms: 80 },
      { char: "i", start_ms: 80, end_ms: 160 },
    ]);
  });
});

describe("charsToWords", () => {
  const timed = (text: string, step = 50) =>
    [...text].map((char, i) => ({ char, start_ms: i * step, end_ms: i * step + step }));

  it("groups characters into words and keeps accents and punctuation", () => {
    const words = charsToWords(timed("Olá, República."));
    expect(words.map((w) => w.word)).toEqual(["Olá,", "República."]);
    expect(words[0]).toEqual({ word: "Olá,", start_ms: 0, end_ms: 200 });
    expect(words[1]).toEqual({ word: "República.", start_ms: 250, end_ms: 750 });
  });

  it("ignores repeated and leading whitespace and returns nothing for empty input", () => {
    expect(charsToWords(timed("  a   b ")).map((w) => w.word)).toEqual(["a", "b"]);
    expect(charsToWords([])).toEqual([]);
  });
});

describe("AlignmentAccumulator", () => {
  it("shifts each chunk by the audio duration of the previous chunks", () => {
    expect(pcmDurationMs(4800)).toBe(100); // 24 kHz * 2 bytes = 48 bytes per ms
    const acc = new AlignmentAccumulator();
    const first = acc.push({ chars: ["O", "i"], charStartTimesMs: [0, 40], charDurationsMs: [40, 60] }, 4800);
    const second = acc.push({ chars: [" ", "a"], charStartTimesMs: [0, 30], charDurationsMs: [30, 50] }, 2400);
    expect(first.map((c) => c.start_ms)).toEqual([0, 40]);
    expect(second.map((c) => c.start_ms)).toEqual([100, 130]);
    expect(acc.all()).toHaveLength(4);
    // a chunk with audio but no alignment still advances the clock
    acc.push(undefined, 4800);
    const third = acc.push({ chars: ["b"], charStartTimesMs: [0], charDurationsMs: [20] }, 960);
    expect(third[0]?.start_ms).toBe(100 + 50 + 100);
  });
});

describe("fromStreamAlignment", () => {
  it("adds the offset to relative times", () => {
    const out = fromStreamAlignment({ chars: ["a"], charStartTimesMs: [10], charDurationsMs: [30] }, 500);
    expect(out).toEqual([{ char: "a", start_ms: 510, end_ms: 540 }]);
  });
});
