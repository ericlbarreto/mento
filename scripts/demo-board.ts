// Builds fixtures/turns/demo-board.json: a scripted, demo-ready board (Física — energia na montanha-russa) with an
// image, a chart, a force diagram, circles and highlights. Run: pnpm tsx scripts/demo-board.ts
// The image is a hand-drawn SVG in apps/web/public/demo (no image API needed).
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FixtureTurn, type Action } from "@mento/contracts";
import { resolveDiagram } from "../packages/tutor/src/diagram/resolve";

const root = resolve(import.meta.dirname, "..");

const resolved = (input: unknown) => {
  const r = resolveDiagram(input);
  if (!r.args) throw new Error(`diagram rejected: ${r.reason}`);
  if (r.notes.length) console.warn(r.notes.join("\n"));
  return r.args;
};

const chart = resolved({
  id: "grafico_energia",
  column: "visuals",
  title: "Ep (azul) e Ec (vermelho) na descida",
  frame: "wide",
  shapes: [
    { id: "eixos", kind: "axes", x_range: [0, 20], y_range: [0, 120], x_ticks: [5, 10, 15, 20], y_ticks: [50, 100], x_label: "queda (m)", y_label: "energia (kJ)" },
    { id: "potencial", kind: "polyline", points: [[0, 100], [20, 0]], color: "blue" },
    { id: "cinetica", kind: "polyline", points: [[0, 0], [20, 100]], color: "red" },
    { id: "mecanica", kind: "line", from: [0, 100], to: [20, 100], dashed: true, label: "Em = 100 kJ", color: "green" },
    { id: "meio", kind: "point", at: [10, 50], label: "Ep = Ec", color: "ink" },
  ],
});

const forces = resolved({
  id: "forcas_carrinho",
  column: "visuals",
  title: "Forças no carrinho na descida",
  frame: "wide",
  shapes: [
    { id: "trilho", kind: "polyline", points: [[15, 85], [145, 85], [15, 30]], closed: true, fill: "soft" },
    { id: "carrinho", kind: "rect", on: { ref: "trilho", t: 0.45 }, w: 22, h: 16, label: "500 kg" },
    { id: "peso", kind: "arrow", from: { ref: "carrinho", side: "center" }, dir: "down", magnitude: 30, label: "Peso", color: "blue" },
    { id: "normal", kind: "arrow", from: { ref: "carrinho", side: "top" }, dir: "normal", magnitude: 24, label: "Normal", color: "green" },
    { id: "velocidade", kind: "arrow", from: { ref: "carrinho", side: "right" }, deg: -23, magnitude: 20, label: "v", color: "red" },
  ],
});

const actions: Action[] = [
  { id: "d0", name: "speak", args: { text: "Bora entender a energia numa montanha-russa? Olha o quadro!", purpose: "explain" } },
  {
    id: "d1",
    name: "write_text",
    args: {
      id: "energia_resumo",
      column: "main",
      html: "<h2>Energia na montanha-russa</h2><p>No alto, o carrinho guarda <b>energia potencial</b>. Na descida, ela vira <b>energia cinética</b>: o movimento.</p><ul><li>Potencial: Ep = m · g · h</li><li>Cinética: Ec = m · v² / 2</li><li>Mecânica: Em = Ep + Ec</li></ul><p>Sem atrito, a energia mecânica <b>se conserva</b>: ela só muda de forma.</p>",
    },
  },
  { id: "d2", name: "draw", args: { id: "montanha_russa", column: "visuals", prompt: "Carrinho no alto da montanha-russa, prestes a descer", is_structured: false, max_dimensions: { w: 520, h: 390 } } },
  { id: "d3", name: "speak", args: { text: "Repare: a energia não some, ela troca de forma.", purpose: "explain" } },
  { id: "d4", name: "highlight", args: { target_id: "energia_resumo", color: "yellow", text_to_match: "energia potencial" } },
  { id: "d5", name: "highlight", args: { target_id: "energia_resumo", color: "pink", text_to_match: "energia cinética" } },
  { id: "d6", name: "circle_annotate", args: { target_id: "energia_resumo", text_to_match: "Em = Ep + Ec", color: "red" } },
  { id: "d7", name: "draw_diagram", args: { ...chart } },
  { id: "d8", name: "speak", args: { text: "No gráfico, a linha azul cai e a vermelha sobe. No meio da queda, as duas são iguais.", purpose: "explain" } },
  { id: "d9", name: "circle_annotate", args: { target_id: "grafico_energia", text_to_match: "Ep = Ec", color: "blue" } },
  {
    id: "d10",
    name: "write_text",
    args: {
      id: "exemplo_conta",
      column: "main",
      html: "<h3>Exemplo</h3><p>Carrinho de 500 kg a 20 m de altura (g = 10 m/s²):</p><ol><li>Ep = 500 · 10 · 20</li><li>Ep = 100 000 J = 100 kJ</li><li>Lá embaixo, Ec = 100 kJ, então v = 20 m/s</li></ol>",
    },
  },
  { id: "d11", name: "highlight", args: { target_id: "exemplo_conta", color: "green", text_to_match: "100 kJ" } },
  { id: "d12", name: "draw_diagram", args: { ...forces } },
  { id: "d13", name: "circle_annotate", args: { target_id: "forcas_carrinho", text_to_match: "Peso", color: "green" } },
  { id: "d14", name: "draw_result", args: { element_id: "montanha_russa", url: "/demo/montanha-russa.svg" } },
  {
    id: "d15",
    name: "ask_verification",
    args: {
      id: "q_energia",
      column: "main",
      verification_id: "ver_demo",
      concept: "Conservação de energia",
      concept_key: "conservacao de energia",
      question: "Se o carrinho começasse a 45 m de altura, qual seria a energia cinética lá embaixo?",
      kind: "transfer",
    },
  },
  { id: "d16", name: "speak", args: { text: "Agora é com você: tenta responder no quadro!", purpose: "question" } },
];

const messages = actions.map((action, order) => ({ at_ms: order * 120, message: { type: "action" as const, order, action } }));
messages.push(
  { at_ms: actions.length * 120, message: { type: "script_done", turn_id: "demo_turn" } as never },
  { at_ms: actions.length * 120 + 20, message: { type: "turn_done", turn_id: "demo_turn" } as never },
);
const fixture = FixtureTurn.parse({
  description: "Demo board (Física): energy on a roller coaster with an image, an energy chart, a force diagram, circles and highlights. Scripted, not recorded.",
  messages,
});
writeFileSync(resolve(root, "fixtures/turns/demo-board.json"), `${JSON.stringify(fixture, null, 1)}\n`);
console.log("wrote fixtures/turns/demo-board.json");

