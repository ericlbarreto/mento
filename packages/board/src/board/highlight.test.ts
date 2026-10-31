// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action } from "@mento/contracts";
import { applyActions, emptyBoard, visibleHighlights } from "../store";
import { planJobs } from "./handwriting";
import { measureLines } from "./HighlightLayer";
import { findTextRange } from "./textMatch";

const write: Action = { id: "w", name: "write_text", args: { id: "t", column: "main", html: "<p>A <strong>República</strong> romana durou séculos.</p>" } };
// `text_to_match` is read loosely until it lands in the contract's HighlightArgs.
const mark = (id: string, color: "yellow" | "green" | "pink" | "blue", text_to_match?: string) =>
  ({ id, name: "highlight", args: { target_id: "t", color, ...(text_to_match ? { text_to_match } : {}) } }) as Action;

describe("passage highlights", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keep their passage and coexist with each other and with the latest whole-block marker", () => {
    const s = applyActions(emptyBoard(), [write, mark("h1", "yellow"), mark("h2", "green", "republica romana"), mark("h3", "blue"), mark("h4", "pink", "séculos")]);
    const shown = visibleHighlights(s.elements.get("t")!.annotations);
    expect(shown.map((h) => [h.action_id, h.color, h.text_to_match])).toEqual([
      ["h3", "blue", undefined],
      ["h2", "green", "republica romana"],
      ["h4", "pink", "séculos"],
    ]);
  });

  it("ignore an empty or too long passage (whole block)", () => {
    const s = applyActions(emptyBoard(), [write, mark("h1", "yellow", " "), mark("h2", "yellow", "x".repeat(121))]);
    expect(s.elements.get("t")!.annotations.map((a) => (a.kind === "highlight" ? a.text_to_match : "?"))).toEqual([undefined, undefined]);
  });

  it("match case- and accent-insensitively across inline tags", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>A <strong>República</strong> romana durou séculos.</p>";
    expect(findTextRange(root, "REPUBLICA ROMANA")?.toString()).toBe("República romana");
  });

  it("measure only the passage's lines (nothing when it is not found)", () => {
    const frame = document.createElement("div");
    const content = document.createElement("div");
    content.innerHTML = "<p>A <strong>República</strong> romana durou séculos.</p>";
    frame.appendChild(content);
    document.body.appendChild(frame);
    const rect = (left: number, top: number, width: number) => ({ left, top, width, height: 20, right: left + width, bottom: top + 20, x: left, y: top }) as DOMRect;
    // Two client rects on two lines for the matched range (jsdom has no layout).
    Range.prototype.getClientRects = vi.fn(() => [rect(40, 0, 80), rect(0, 30, 60)] as unknown as DOMRectList);
    const lines = measureLines(content, frame, "república romana");
    expect(lines.map((l) => [l.left, l.right])).toEqual([
      [40, 120],
      [0, 60],
    ]);
    expect(measureLines(content, frame, "Cartago")).toEqual([]);
  });

  it("is swept by the pen live and drawn at once on a restore", () => {
    const before = applyActions(emptyBoard(), [write]);
    const after = applyActions(before, [mark("h2", "green", "romana"), mark("h4", "pink", "séculos")]);
    expect(planJobs(before, after)).toEqual([
      { kind: "mark", id: "t", action_id: "h2" },
      { kind: "mark", id: "t", action_id: "h4" },
    ]);
    expect(planJobs(before, after, { instant: true })).toEqual([]);
  });
});
