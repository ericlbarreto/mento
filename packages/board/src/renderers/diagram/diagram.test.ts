import { describe, expect, it, vi } from "vitest";
import type { Action } from "@mento/contracts";
import { DIAGRAM_EXAMPLES, FIXTURE_TURNS } from "../../mock";
import { defaultHandlers } from "../../queue/handlers";
import type { HandlerContext } from "../../queue/types";
import { applyActions } from "../../store/reducer";
import { createBoardStore } from "../../store/store";
import { emptyBoard } from "../../store/types";
import { diagramAriaLabel, drawDiagram, seedOf } from "./geometry";
import { isDiagramLive } from "./live";

const newton = (): Action[] =>
  FIXTURE_TURNS["newton-blocks"].messages
    .flatMap(({ message: m }) => (m.type === "action" ? [m] : []))
    .sort((a, b) => a.order - b.order)
    .map((m) => m.action);

describe("draw_diagram on the board", () => {
  it("adds a diagram element and keeps shape_id on its annotations", () => {
    const onWarning = vi.fn();
    const s = applyActions(emptyBoard(), newton(), { onWarning, now: 1 });
    const el = s.elements.get("bloco_forcas");
    expect(el?.type).toBe("diagram");
    expect(s.columns.visuals).toEqual(["bloco_forcas"]);
    expect(el?.annotations).toEqual([
      { kind: "circle", color: "red", text_to_match: "F = 10 N", action_id: "act_n3", shape_id: "forca" },
      { kind: "highlight", color: "blue", action_id: "act_n5", shape_id: "peso" },
    ]);
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("marks a diagram played by the queue as live (restored ones are not)", async () => {
    const store = createBoardStore();
    const action = newton().find((a) => a.name === "draw_diagram") as Extract<Action, { name: "draw_diagram" }>;
    store.dispatch({ ...action, args: { ...action.args, id: "restaurado" } });
    expect(isDiagramLive("restaurado")).toBe(false);
    const ctx = { store, reveal: async () => {} } as unknown as HandlerContext;
    await defaultHandlers.draw_diagram?.(action, ctx);
    expect(isDiagramLive("bloco_forcas")).toBe(true);
    expect(store.getElement("bloco_forcas")?.type).toBe("diagram");
  });
});

describe("drawDiagram", () => {
  const ex = DIAGRAM_EXAMPLES.find((e) => e.name === "free_body")!;

  it("is deterministic per element and shape, and differs between elements", () => {
    const a = drawDiagram(ex.args.id, ex.args);
    expect(drawDiagram(ex.args.id, ex.args)).toEqual(a);
    expect(drawDiagram("outro", ex.args)[1]?.strokes[0]?.d).not.toBe(a[1]?.strokes[0]?.d);
    expect(seedOf("a:b")).toBe(seedOf("a:b"));
    expect(seedOf("a:b")).toBeGreaterThan(0);
  });

  it("draws every example with strokes or dots and labels in board units", () => {
    for (const { name, args } of DIAGRAM_EXAMPLES) {
      const drawn = drawDiagram(args.id, args);
      expect(drawn.map((d) => d.id), name).toEqual(args.shapes.map((s) => s.id));
      for (const d of drawn) {
        if (d.kind !== "text") expect(d.strokes.length + d.dots.length, `${name}/${d.id}`).toBeGreaterThan(0);
        for (const s of d.strokes) expect(s.d).toMatch(/^M/);
        expect(d.box.w + d.box.h, `${name}/${d.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("fills a soft box and colors arrows and their labels", () => {
    const drawn = drawDiagram(ex.args.id, ex.args);
    const block = drawn.find((d) => d.id === "bloco")!;
    expect(block.fills).toHaveLength(1);
    const f = drawn.find((d) => d.id === "forca")!;
    expect(f.strokes.every((s) => s.stroke === "#dc2626")).toBe(true);
    expect(f.texts[0]).toMatchObject({ text: "F = 10 N", color: "#dc2626" });
  });

  it("names the diagram for screen readers with its title and labels", () => {
    expect(diagramAriaLabel(ex.args, drawDiagram(ex.args.id, ex.args))).toBe("Forças no bloco: 2 kg, F = 10 N, P = 20 N, N = 20 N");
  });
});
