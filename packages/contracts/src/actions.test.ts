import { describe, expect, it } from "vitest";
import { Action, ActionName, AskVerificationArgs, AskVerificationBase, DiagramArgs, DiagramBase, SpeakArgs, SpeakBase, WriteTextBase } from "./actions";
import { diagramLabels } from "./diagram";

const speak = (args: Record<string, unknown>) => ({ id: "act_1", name: "speak", args });

describe("Action", () => {
  it("accepts a plain speak", () => {
    expect(Action.safeParse(speak({ text: "Olá!" })).success).toBe(true);
  });

  it("requires hint_level when purpose is hint", () => {
    expect(Action.safeParse(speak({ text: "Pense na data.", purpose: "hint" })).success).toBe(false);
    expect(Action.safeParse(speak({ text: "Pense na data.", purpose: "hint", hint_level: 1 })).success).toBe(true);
  });

  it("accepts a citation with a string material_id", () => {
    const sources = [{ material_id: "6650f0c2a1b2c3d4e5f60718", page: 12, quote: "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto" }];
    expect(Action.safeParse(speak({ text: "Repare nessa data.", sources })).success).toBe(true);
  });

  it("rejects an unknown tool and an unknown column", () => {
    expect(Action.safeParse({ id: "act_2", name: "teleport", args: {} }).success).toBe(false);
    const bad = { id: "act_3", name: "write_text", args: { id: "title", column: "left", html: "<p>x</p>" } };
    expect(Action.safeParse(bad).success).toBe(false);
  });

  it("rejects element ids that are not snake_case slugs", () => {
    const bad = { id: "act_4", name: "highlight", args: { target_id: "Meu Título", color: "yellow" } };
    expect(Action.safeParse(bad).success).toBe(false);
  });

  it("validates timeline events and draw dimensions", () => {
    const tl = { id: "act_5", name: "write_timeline", args: { id: "tl", column: "main", events: [{ date: "509 a.C.", label: "Início da República" }] } };
    expect(Action.safeParse(tl).success).toBe(true);
    const draw = { id: "act_6", name: "draw", args: { id: "colosseum", column: "visuals", prompt: "Coliseu romano", is_structured: false, max_dimensions: { w: 500, h: 400 } } };
    expect(Action.safeParse(draw).success).toBe(true);
    expect(Action.safeParse({ ...draw, args: { ...draw.args, max_dimensions: { w: 0, h: 400 } } }).success).toBe(false);
  });

  it("exposes model-facing bases without the server-filled fields", () => {
    expect("audio_url" in SpeakBase.shape).toBe(false);
    expect("audio_url" in SpeakArgs.shape).toBe(true);
    expect("verification_id" in AskVerificationBase.shape).toBe(false);
    expect("concept_key" in AskVerificationArgs.shape).toBe(true);
    expect(WriteTextBase.safeParse({ id: "t", column: "main", html: "<p>x</p>" }).success).toBe(true);
  });

  it("lists every tool name", () => {
    expect(ActionName.options).toEqual([
      "speak", "write_text", "write_timeline", "highlight", "circle_annotate",
      "draw", "draw_result", "update_element", "remove_element", "ask_verification", "draw_diagram",
    ]);
  });
});

describe("draw_diagram", () => {
  const resolved = {
    id: "forcas",
    column: "visuals",
    title: "Forças no bloco",
    frame: "wide",
    view: { w: 160, h: 100 },
    shapes: [
      { id: "bloco", kind: "rect", x: 50, y: 40, w: 30, h: 20, angle: 0, fill: "soft", color: "ink", label: { text: "2 kg", x: 65, y: 50, size: "m" } },
      { id: "peso", kind: "arrow", x1: 65, y1: 50, x2: 65, y2: 84, color: "blue", label: { text: "P", x: 65, y: 90, size: "m" } },
    ],
  };

  it("accepts a resolved diagram and rejects model-style anchors in it", () => {
    expect(Action.safeParse({ id: "a", name: "draw_diagram", args: resolved }).success).toBe(true);
    const anchored = { ...resolved, shapes: [{ id: "f", kind: "arrow", from: { ref: "bloco" }, dir: "up" }] };
    expect(Action.safeParse({ id: "a", name: "draw_diagram", args: anchored }).success).toBe(false);
  });

  it("caps shapes and label length and requires snake_case shape ids", () => {
    const many = { ...resolved, shapes: Array.from({ length: 25 }, (_, i) => ({ id: `p_${i}`, kind: "point", x: i, y: 1, color: "ink" })) };
    expect(DiagramArgs.safeParse(many).success).toBe(false);
    const long = { ...resolved, shapes: [{ ...resolved.shapes[1], label: { text: "x".repeat(41), x: 1, y: 1, size: "m" } }] };
    expect(DiagramArgs.safeParse(long).success).toBe(false);
    expect(DiagramArgs.safeParse({ ...resolved, shapes: [{ ...resolved.shapes[0], id: "Bloco A" }] }).success).toBe(false);
  });

  it("lets the model anchor arrows on shapes and use data units", () => {
    const base = {
      id: "grafico",
      column: "visuals",
      title: "f(x) = x²",
      frame: "wide",
      shapes: [
        { id: "eixos", kind: "axes", x_range: [-3, 3], y_range: [0, 9] },
        { id: "curva", kind: "polyline", points: [[-3, 9], [0, 0], [3, 9]], smooth: true },
        { id: "bloco", kind: "rect", on: { ref: "chao" }, w: 20, h: 10 },
        { id: "seta", kind: "arrow", from: { ref: "bloco", side: "top" }, dir: "normal", magnitude: 5, label: "N" },
      ],
    };
    expect(DiagramBase.safeParse(base).success).toBe(true);
    expect(DiagramBase.safeParse({ ...base, frame: "huge" }).success).toBe(false);
  });

  it("targets one shape with highlight and circle_annotate", () => {
    expect(Action.safeParse({ id: "h", name: "highlight", args: { target_id: "forcas", color: "yellow", shape_id: "peso" } }).success).toBe(true);
    expect(Action.safeParse({ id: "c", name: "circle_annotate", args: { target_id: "forcas", text_to_match: "P", color: "red", shape_id: "peso" } }).success).toBe(true);
    expect(Action.safeParse({ id: "c", name: "circle_annotate", args: { target_id: "forcas", text_to_match: "P", color: "red", shape_id: "Peso!" } }).success).toBe(false);
  });

  it("lists the labels circle_annotate can match", () => {
    expect(diagramLabels(DiagramArgs.parse(resolved))).toEqual([{ shape_id: "bloco", text: "2 kg" }, { shape_id: "peso", text: "P" }]);
  });
});
