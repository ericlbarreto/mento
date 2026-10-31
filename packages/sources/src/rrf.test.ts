import { describe, expect, it } from "vitest";
import type { Chunk } from "@mento/contracts";
import { reciprocalRankFusion } from "./rrf";

const c = (id: string): Chunk => ({ id, material_id: "m", subject: "history", page: 1, passage_idx: 0, text: id });

describe("reciprocalRankFusion", () => {
  it("ranks chunks found by both lists above chunks found by one, and removes duplicates", () => {
    const out = reciprocalRankFusion([[c("a"), c("b"), c("c")], [c("b"), c("d")]]);
    expect(out.map((x) => x.id)).toEqual(["b", "a", "d", "c"]);
    expect(out[0]!.score).toBeCloseTo(1 / 62 + 1 / 61, 10);
  });

  it("handles empty lists and keeps the order of a single list", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[c("x"), c("y")], []]).map((x) => x.id)).toEqual(["x", "y"]);
  });
});
