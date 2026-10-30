import { describe, expect, it } from "vitest";
import { Action, ActionName, AskVerificationArgs, AskVerificationBase, SpeakArgs, SpeakBase, WriteTextBase } from "./actions";

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
      "draw", "draw_result", "update_element", "remove_element", "ask_verification",
    ]);
  });
});
