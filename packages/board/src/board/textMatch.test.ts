// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { circlePath } from "./CircleLayer";
import { findTextRange } from "./textMatch";

const dom = (html: string): HTMLElement => {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
};

// Same markup as TimelineRenderer: date and label in separate spans, no space between them in the DOM.
const timeline = (events: { date: string; label: string }[]) =>
  dom(
    `<ol>${events
      .map((e) => `<li><span aria-hidden></span><span data-timeline-date>${e.date}</span><span>${e.label}</span></li>`)
      .join("")}</ol>`,
  );

describe("findTextRange", () => {
  it("finds the first match in write_text HTML, ignoring case", () => {
    const root = dom("<h3>A República</h3><p>Os <b>cônsules</b> eram dois. Cônsules de novo.</p>");
    const range = findTextRange(root, "CÔNSULES");
    expect(range?.toString()).toBe("cônsules");
    expect(range?.startContainer.parentElement?.tagName).toBe("B");
  });

  it("spans inline tags", () => {
    const root = dom("<p>O <b>Senado</b> era <i>vitalício</i> em Roma.</p>");
    expect(findTextRange(root, "Senado era vitalício")?.toString()).toBe("Senado era vitalício");
  });

  it("ignores accents and extra whitespace", () => {
    const root = dom("<p>Júlio   César\n atravessou o Rubicão</p>");
    expect(findTextRange(root, "julio cesar")?.toString()).toBe("Júlio   César");
    expect(findTextRange(root, "Rubicao")?.toString()).toBe("Rubicão");
  });

  it("finds a date on a timeline (real circle_annotate from a live turn)", () => {
    // From POST /api/sessions/:id/turn: circle_annotate { target_id: "linha_republica", text_to_match: "509 a.C." }.
    const root = timeline([
      { date: "509 a.C.", label: "Data tradicional da implantação da República" },
      { date: "504 a.C.", label: "Batalha de Arícia" },
    ]);
    const range = findTextRange(root, "509 a.C.");
    expect(range?.toString()).toBe("509 a.C.");
    expect((range?.startContainer.parentElement as HTMLElement).dataset.timelineDate).toBe("");
  });

  it("matches across a timeline date and its label (the server joins them with a space)", () => {
    const root = timeline([{ date: "27 a.C.", label: "Augusto, primeiro imperador" }]);
    expect(findTextRange(root, "27 a.C. Augusto")?.toString()).toBe("27 a.C.Augusto");
  });

  it("returns null when the text is not there", () => {
    expect(findTextRange(dom("<p>Roma</p>"), "Cartago")).toBeNull();
    expect(findTextRange(dom("<p>Roma</p>"), "   ")).toBeNull();
  });
});

describe("circlePath", () => {
  it("draws a closed-looking loop around the box", () => {
    const d = circlePath({ x: 10, y: 20, w: 100, h: 30 }, 0.4);
    expect(d.startsWith("M ")).toBe(true);
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeLessThan(10);
    expect(Math.max(...xs)).toBeGreaterThan(110);
    expect(Math.min(...ys)).toBeLessThan(20);
    expect(Math.max(...ys)).toBeGreaterThan(50);
  });
});
