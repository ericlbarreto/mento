import { describe, expect, it } from "vitest";
import { type BoardState, type ElementState, emptyBoard } from "@mento/board";
import { formatElapsed, formatItems, lastCitedPage, sessionStats } from "./sessionStats";

const START = "2026-10-30T12:00:00.000Z";
const at = (minutes: number) => Date.parse(START) + minutes * 60_000;

function board(elements: Array<Partial<ElementState> & { id: string }>): BoardState {
  const base = emptyBoard();
  const map = new Map<string, ElementState>();
  for (const el of elements) {
    map.set(el.id, { type: "text", author: "tutor", column: "main", created_at: 0, data: { html: "" }, annotations: [], ...el } as ElementState);
  }
  return { ...base, elements: map };
}

const cite = (page: number) => ({ material_id: "m1", page, quote: "q" });

describe("formatElapsed", () => {
  it("shows minutes, hours and a sub-minute value", () => {
    expect(formatElapsed(START, at(0.5))).toBe("< 1 min");
    expect(formatElapsed(START, at(15.9))).toBe("15 min");
    expect(formatElapsed(START, at(65))).toBe("1 h 05 min");
  });

  it("is unknown without a valid start, and never negative", () => {
    expect(formatElapsed(null, at(5))).toBeNull();
    expect(formatElapsed("not a date", at(5))).toBeNull();
    expect(formatElapsed(START, at(-3))).toBe("< 1 min");
  });
});

describe("board stats", () => {
  it("pluralizes the item count", () => {
    expect(formatItems(0)).toBe("0 itens");
    expect(formatItems(1)).toBe("1 item");
    expect(formatItems(3)).toBe("3 itens");
  });

  it("takes the last source of the most recent cited element", () => {
    const b = board([
      { id: "a", created_at: 1, sources: [cite(12)] },
      { id: "b", created_at: 3, sources: [cite(40), cite(45)] },
      { id: "c", created_at: 5 },
      { id: "d", created_at: 2, sources: [cite(99)] },
    ]);
    expect(lastCitedPage(b)).toBe(45);
    expect(lastCitedPage(board([{ id: "x" }]))).toBeNull();
    expect(lastCitedPage(null)).toBeNull();
  });

  it("prefers the latest cited line of the conversation", () => {
    const b = board([{ id: "a", created_at: 1, sources: [cite(12)] }]);
    expect(lastCitedPage(b, [{ sources: [cite(3)] }, { sources: [cite(8), cite(9)] }, {}])).toBe(9);
    expect(lastCitedPage(b, [{}, {}])).toBe(12);
  });

  it("hides each stat that is unknown", () => {
    expect(sessionStats(null, null, at(1))).toEqual({ elapsed: null, items: null, reference: null });
    expect(sessionStats(START, board([{ id: "a", sources: [cite(7)] }, { id: "b" }]), at(15))).toEqual({
      elapsed: "15 min",
      items: "2 itens",
      reference: "pág. 7",
    });
  });
});
