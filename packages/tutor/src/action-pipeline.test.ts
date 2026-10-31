import { describe, expect, it } from "vitest";
import type { Chunk, Retriever, StreamMessage } from "@mento/contracts";
import { Board } from "./board";
import { commitAction, prepareAction, type PrepareContext } from "./action-pipeline";
import type { ToolBlock } from "./tool-assembler";

const block = (name: string, input: unknown): ToolBlock => ({ id: "toolu_1", name, raw_input: typeof input === "string" ? input : JSON.stringify(input) });
const retriever: Retriever = { searchChunks: async () => [], validateCitation: async () => false };
const passage: Chunk = { id: "c1", material_id: "m1", subject: "history", page: 12, passage_idx: 0, text: "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto." };
const ctx = (board = new Board(), passages: Chunk[] = []): PrepareContext => ({ id: "act_1_0", verification_id: "ver_1", board, passages, retriever });

describe("prepareAction", () => {
  it("accepts a valid speak", async () => {
    const out = await prepareAction(block("speak", { text: "Olá!" }), ctx());
    expect(out).toMatchObject({ kind: "ok", action: { id: "act_1_0", name: "speak" } });
  });

  it("drops invalid JSON, unknown tools, schema violations and board violations with a reason", async () => {
    for (const b of [
      block("speak", '{"text": "cortado'),
      block("teleport", {}),
      block("speak", { text: "x", purpose: "hint" }),
      block("highlight", { target_id: "ghost", color: "yellow" }),
      block("draw_result", { element_id: "x", url: "/x" }),
    ]) {
      const out = await prepareAction(b, ctx());
      expect(out.kind, b.name).toBe("dropped");
    }
  });

  it("resolves draw_diagram into absolute geometry and drops an empty one", async () => {
    const input = {
      id: "forcas",
      column: "visuals",
      title: "Forças no bloco",
      frame: "wide",
      shapes: [
        { id: "chao", kind: "line", from: [10, 70], to: [150, 70], ground: true },
        { id: "bloco", kind: "rect", on: { ref: "chao" }, w: 30, h: 20, label: "2 kg" },
        { id: "forca", kind: "arrow", from: { ref: "bloco", side: "right" }, dir: "right", magnitude: 10, label: "F" },
        { id: "fantasma", kind: "arrow", from: { ref: "nada" }, dir: "up" },
      ],
    };
    const out = await prepareAction(block("draw_diagram", input), ctx());
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok" || out.action.name !== "draw_diagram") throw new Error("expected a draw_diagram");
    expect(out.action.args.view).toEqual({ w: 160, h: 100 });
    expect(out.action.args.shapes.map((s) => s.id)).toEqual(["chao", "bloco", "forca"]);
    expect(out.action.args.shapes[2]).toMatchObject({ kind: "arrow", x1: 95, color: "ink", label: { text: "F" } });
    expect(out.notes?.[0]).toMatch(/fantasma/);

    const empty = await prepareAction(block("draw_diagram", { ...input, shapes: [{ id: "x", kind: "cloud" }] }), ctx());
    expect(empty).toMatchObject({ kind: "dropped", reason: "draw_diagram: empty diagram: no valid shape" });
  });

  it("forces draw to the image pipeline (is_structured = false)", async () => {
    const out = await prepareAction(block("draw", { id: "coliseu", column: "visuals", prompt: "Coliseu", is_structured: true, max_dimensions: { w: 500, h: 400 } }), ctx());
    expect(out).toMatchObject({ kind: "ok", action: { args: { is_structured: false } } });
    const omitted = await prepareAction(block("draw", { id: "coliseu", column: "visuals", prompt: "Coliseu", max_dimensions: { w: 500, h: 400 } }), ctx());
    expect(omitted).toMatchObject({ kind: "ok", action: { args: { is_structured: false } } });
  });

  it("fills verification_id and concept_key for ask_verification", async () => {
    const out = await prepareAction(
      block("ask_verification", { id: "q1", column: "main", concept: "Fim da República", question: "Por que mudou?", kind: "explain" }),
      ctx(),
    );
    expect(out).toMatchObject({ kind: "ok", action: { args: { verification_id: "ver_1", concept_key: "fim da republica" } } });
  });

  it("sanitizes HTML and drops a write_text that becomes empty", async () => {
    const ok = await prepareAction(block("write_text", { id: "t", column: "main", html: '<h1 onclick="x">Roma</h1><script>1</script>' }), ctx());
    expect(ok).toMatchObject({ kind: "ok", action: { args: { html: "<h1>Roma</h1>" } } });
    const empty = await prepareAction(block("write_text", { id: "t2", column: "main", html: "<script>1</script>" }), ctx());
    expect(empty.kind).toBe("dropped");
  });

  it("removes fake citations but keeps the action", async () => {
    const real = { material_id: "m1", page: 12, quote: "o Senado concedeu a Otávio" };
    const fake = { material_id: "m1", page: 40, quote: "frase inventada" };
    const out = await prepareAction(block("speak", { text: "Repare.", sources: [real, fake] }), ctx(new Board(), [passage]));
    expect(out).toMatchObject({ kind: "ok", dropped_citations: 1 });
    if (out.kind === "ok" && out.action.name === "speak") expect(out.action.args.sources).toEqual([real]);
  });
});

describe("commitAction", () => {
  function setup() {
    const emitted: StreamMessage[] = [];
    const persisted: { type: string; payload: unknown }[] = [];
    const board = new Board();
    return {
      emitted, persisted, board,
      ctx: { turn_id: "turn_3", board, openVerification: { verification_id: "ver_1", concept_key: "fim da republica" }, persist: (e: { type: string; payload: unknown }) => persisted.push(e), emit: (m: StreamMessage) => emitted.push(m) },
    };
  }

  it("applies, emits and persists a tutor_action", () => {
    const s = setup();
    commitAction({ id: "act_3_0", name: "write_text", args: { id: "title", column: "main", html: "<h1>x</h1>" } }, 0, s.ctx as never);
    expect(s.board.has("title")).toBe(true);
    expect(s.emitted).toEqual([{ type: "action", order: 0, action: { id: "act_3_0", name: "write_text", args: { id: "title", column: "main", html: "<h1>x</h1>" } } }]);
    expect(s.persisted).toEqual([{ type: "tutor_action", payload: { turn_id: "turn_3", action_id: "act_3_0", order: 0, name: "write_text", args: { id: "title", column: "main", html: "<h1>x</h1>" } } }]);
  });

  it("also persists hint_given for hints and verification_asked for questions", () => {
    const s = setup();
    commitAction({ id: "a1", name: "speak", args: { text: "Pense na data.", purpose: "hint", hint_level: 2 } }, 0, s.ctx as never);
    expect(s.persisted.map((e) => e.type)).toEqual(["tutor_action", "hint_given"]);
    expect(s.persisted[1]?.payload).toEqual({ turn_id: "turn_3", level: 2, verification_id: "ver_1", concept_key: "fim da republica" });

    commitAction({ id: "a2", name: "ask_verification", args: { id: "q1", column: "main", verification_id: "ver_2", concept: "Fim da República", concept_key: "fim da republica", question: "Por quê?", kind: "explain" } }, 1, s.ctx as never);
    expect(s.persisted.at(-1)).toEqual({ type: "verification_asked", payload: { verification_id: "ver_2", element_id: "q1", concept: "Fim da República", concept_key: "fim da republica", question: "Por quê?", kind: "explain" } });
  });
});
