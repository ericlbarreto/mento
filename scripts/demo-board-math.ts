// Builds fixtures/turns/demo-board-math.json: a scripted, demo-ready board (Matemática 8º ano — a corrida de
// aplicativo como equação e como reta) with an image, a line chart, a balance diagram, circles, highlights and
// citations of the real math material. Run: pnpm exec tsx scripts/demo-board-math.ts
// The image is a hand-drawn SVG in apps/web/public/demo (no image API needed). Quotes are verbatim from the
// material's pages (chapter 2, pp. 10–14) so they pass the server-side citation check.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FixtureTurn, type Action } from "@mento/contracts";
import { resolveDiagram } from "../packages/tutor/src/diagram/resolve";

const root = resolve(import.meta.dirname, "..");

/** "Matemática 8º ano — Potências, equações e gráficos" in the local database. */
const MATERIAL_ID = "6ae58c44e9c705bf12a947e8";
const cite = (page: number, quote: string) => ({ material_id: MATERIAL_ID, page, quote });

const resolved = (input: unknown) => {
  const r = resolveDiagram(input);
  if (!r.args) throw new Error(`diagram rejected: ${r.reason}`);
  if (r.notes.length) console.warn(r.notes.join("\n"));
  return r.args;
};

// y = 2x + 5: fare (R$) for x km. Points: (0, 5) fixed fare, (3, 11), (9, 23) the R$ 23 ride.
const chart = resolved({
  id: "grafico_corrida",
  column: "visuals",
  title: "Preço da corrida: y = 2x + 5",
  frame: "wide",
  shapes: [
    { id: "eixos", kind: "axes", x_range: [0, 10], y_range: [0, 30], x_ticks: [3, 6, 9], y_ticks: [5, 10, 15, 20, 25], x_label: "distância (km)", y_label: "preço (R$)" },
    { id: "reta", kind: "polyline", points: [[0, 5], [10, 25]], color: "blue", label: "y = 2x + 5" },
    { id: "guia_h", kind: "line", from: [0, 23], to: [9, 23], dashed: true, color: "green" },
    { id: "guia_v", kind: "line", from: [9, 0], to: [9, 23], dashed: true, color: "green" },
    { id: "tarifa", kind: "point", at: [0, 5], color: "red" },
    { id: "tarifa_txt", kind: "text", at: [2, 2.8], text: "tarifa fixa", size: "s", color: "red" },
    { id: "tres_km", kind: "point", at: [3, 11], label: "(3, 11)", color: "ink" },
    { id: "resposta", kind: "point", at: [9, 23], label: "(9, 23)", color: "green" },
  ],
});

// The book's "ideia da balança" (p. 10): 2x + 5 on one pan, 23 on the other; take 5 from both.
const balance = resolved({
  id: "balanca_equacao",
  column: "visuals",
  title: "A balança: tire 5 dos dois pratos",
  frame: "wide",
  shapes: [
    { id: "base", kind: "line", from: [55, 92], to: [105, 92], ground: true },
    { id: "haste", kind: "line", from: [80, 92], to: [80, 30] },
    { id: "pe", kind: "polyline", points: [[70, 92], [90, 92], [80, 82]], closed: true, fill: "soft" },
    { id: "travessa", kind: "line", from: [30, 30], to: [130, 30] },
    { id: "fio_e1", kind: "line", from: [35, 30], to: [17, 58] },
    { id: "fio_e2", kind: "line", from: [35, 30], to: [53, 58] },
    { id: "fio_d1", kind: "line", from: [125, 30], to: [107, 58] },
    { id: "fio_d2", kind: "line", from: [125, 30], to: [143, 58] },
    { id: "prato_e", kind: "polyline", points: [[12, 58], [58, 58], [50, 66], [20, 66]], closed: true, fill: "soft", color: "blue" },
    { id: "prato_d", kind: "polyline", points: [[102, 58], [148, 58], [140, 66], [110, 66]], closed: true, fill: "soft", color: "red" },
    { id: "lado_e", kind: "text", at: [35, 52], text: "2x + 5", size: "m", color: "blue" },
    { id: "lado_d", kind: "text", at: [125, 52], text: "23", size: "m", color: "red" },
    { id: "menos_e", kind: "text", at: [35, 78], text: "− 5", size: "m", color: "blue" },
    { id: "menos_d", kind: "text", at: [125, 78], text: "− 5", size: "m", color: "red" },
    { id: "result_e", kind: "text", at: [35, 90], text: "2x", size: "m", color: "ink" },
    { id: "result_d", kind: "text", at: [125, 90], text: "18", size: "m", color: "ink" },
  ],
});

const actions: Action[] = [
  {
    id: "m0",
    name: "speak",
    args: {
      text: "Bora transformar uma corrida de aplicativo em matemática? O livro tem um exemplo ótimo!",
      purpose: "explain",
      sources: [cite(10, "Imagine um aplicativo fictício que cobra R$ 5,00 de tarifa fixa e R$ 2,00 por quilômetro.")],
    },
  },
  {
    id: "m1",
    name: "write_text",
    args: {
      id: "corrida_regra",
      column: "main",
      html: "<h2>A corrida de aplicativo</h2><p>O app cobra <b>R$ 5,00 de tarifa fixa</b> mais <b>R$ 2,00 por quilômetro</b>.</p><ul><li>3 km: 5 + 2 · 3 = R$ 11,00</li><li>10 km: 5 + 2 · 10 = R$ 25,00</li></ul><p>Com x = quilômetros e y = preço: <b>y = 2x + 5</b></p><p><small>📖 Livro, p. 10 e 13</small></p>",
      sources: [
        cite(10, "Uma corrida de 3 km custa 5 + 2 × 3 = R$ 11,00."),
        cite(13, "a regra de preço é y = 2x + 5"),
      ],
    },
  },
  { id: "m2", name: "draw", args: { id: "corrida_app", column: "visuals", prompt: "Carro de aplicativo na rua e um celular mostrando a tarifa e o total de R$ 23,00", is_structured: false, max_dimensions: { w: 520, h: 390 } } },
  { id: "m3", name: "highlight", args: { target_id: "corrida_regra", color: "yellow", text_to_match: "R$ 5,00 de tarifa fixa" } },
  { id: "m4", name: "highlight", args: { target_id: "corrida_regra", color: "blue", text_to_match: "R$ 2,00 por quilômetro" } },
  { id: "m5", name: "speak", args: { text: "Agora a pergunta ao contrário: a corrida custou 23 reais. Quantos quilômetros foram?", purpose: "question" } },
  {
    id: "m6",
    name: "write_text",
    args: {
      id: "equacao_passos",
      column: "main",
      html: "<h3>Corrida de R$ 23,00: quantos km?</h3><p>Incógnita: x = número de quilômetros.</p><ol><li>Equação: 5 + 2x = 23</li><li>Tiro 5 dos dois lados: 2x = 23 − 5, então 2x = 18</li><li>Divido os dois lados por 2: x = 18 ÷ 2, então x = 9</li><li>Verificação: 5 + 2 · 9 = 5 + 18 = 23 ✔</li></ol><p><b>Resposta:</b> a corrida teve 9 km.</p><p><small>📖 Livro, p. 12</small></p>",
      sources: [cite(12, "Equação: 5 + 2x = 23. Resolução: 2x = 18, então x = 9.")],
    },
  },
  { id: "m7", name: "draw_diagram", args: { ...balance } },
  {
    id: "m8",
    name: "speak",
    args: {
      text: "É como uma balança: o que eu tiro de um prato, tiro do outro também. Assim ela continua equilibrada.",
      purpose: "explain",
      sources: [cite(10, "Se tirarmos 5 gramas de um prato, precisamos tirar 5 gramas do outro para manter o equilíbrio.")],
    },
  },
  { id: "m9", name: "highlight", args: { target_id: "equacao_passos", color: "yellow", text_to_match: "2x = 18" } },
  { id: "m10", name: "circle_annotate", args: { target_id: "balanca_equacao", text_to_match: "18", color: "green" } },
  { id: "m11", name: "highlight", args: { target_id: "equacao_passos", color: "green", text_to_match: "x = 9" } },
  { id: "m12", name: "circle_annotate", args: { target_id: "equacao_passos", text_to_match: "a corrida teve 9 km", color: "red" } },
  { id: "m13", name: "draw_diagram", args: { ...chart } },
  {
    id: "m14",
    name: "speak",
    args: {
      text: "Olha que legal: resolver a equação é achar, na reta, o ponto em que o preço vale 23. É o ponto (9, 23).",
      purpose: "explain",
      sources: [cite(14, "Resolver 5 + 2x = 23 é o mesmo que procurar, na reta y = 2x + 5, o ponto em que y vale 23.")],
    },
  },
  { id: "m16", name: "circle_annotate", args: { target_id: "grafico_corrida", text_to_match: "(9, 23)", color: "green" } },
  { id: "m17", name: "circle_annotate", args: { target_id: "grafico_corrida", text_to_match: "tarifa fixa", color: "red" } },
  {
    id: "m18",
    name: "write_text",
    args: {
      id: "leitura_reta",
      column: "main",
      html: "<h3>Lendo a reta y = 2x + 5</h3><ul><li><b>5</b>: onde a reta corta o eixo y, no ponto (0, 5). É a tarifa fixa.</li><li><b>2</b>: a inclinação. A cada 1 km para a direita, o preço sobe R$ 2,00.</li></ul><p><small>📖 Livro, p. 14</small></p>",
      sources: [
        cite(14, "a reta corta o eixo y no ponto (0, 5), que é a tarifa fixa, paga mesmo antes de andar."),
        cite(14, "a cada 1 km para a direita, a reta sobe 2 reais."),
      ],
    },
  },
  { id: "m19", name: "highlight", args: { target_id: "leitura_reta", color: "pink", text_to_match: "a inclinação" } },
  { id: "m20", name: "draw_result", args: { element_id: "corrida_app", url: "/demo/math-corrida-app.svg" } },
  {
    id: "m21",
    name: "ask_verification",
    args: {
      id: "q_corrida",
      column: "main",
      verification_id: "ver_demo_math",
      concept: "Equação do 1º grau",
      concept_key: "equacao do 1 grau",
      question: "Outro app cobra R$ 4,00 de tarifa fixa e R$ 2,50 por km. A corrida custou R$ 29,00. Monte a equação: quantos km foram?",
      kind: "transfer",
    },
  },
  { id: "m22", name: "speak", args: { text: "Agora é com você: monta a equação e me conta quantos quilômetros deu!", purpose: "question" } },
];

const messages = actions.map((action, order) => ({ at_ms: order * 120, message: { type: "action" as const, order, action } }));
messages.push(
  { at_ms: actions.length * 120, message: { type: "script_done", turn_id: "demo_turn_math" } as never },
  { at_ms: actions.length * 120 + 20, message: { type: "turn_done", turn_id: "demo_turn_math" } as never },
);
const fixture = FixtureTurn.parse({
  description: "Demo board (Matemática): a ride-app fare as an equation and as a line, with an image, a balance diagram, a line chart, circles, highlights and citations of the math material. Scripted, not recorded.",
  messages,
});
writeFileSync(resolve(root, "fixtures/turns/demo-board-math.json"), `${JSON.stringify(fixture, null, 1)}\n`);
console.log("wrote fixtures/turns/demo-board-math.json");
