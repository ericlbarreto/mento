// Builds fixtures/turns/demo-board-biology.json: a scripted, demo-ready board (Biologia — hormônios e
// retroalimentação) with an image, a hormone-chain diagram, a qualitative glucose chart, circles, highlights and
// citations of the real "Biologia 8º ano — Reprodução, hormônios e saúde" material (quotes copied from its pages).
// Run: pnpm exec tsx scripts/demo-board-biology.ts
// The image is a hand-drawn SVG in apps/web/public/demo (no image API needed).
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FixtureTurn, type Action } from "@mento/contracts";
import { resolveDiagram } from "../packages/tutor/src/diagram/resolve";

const root = resolve(import.meta.dirname, "..");

/** The biology material as ingested (GET /api/materials). Quotes below occur verbatim in these pages. */
const MATERIAL_ID = "6ae58c4dc54e8af46024b34e";
const cite = (page: number, quote: string) => ({ material_id: MATERIAL_ID, page, quote });

const resolved = (input: unknown) => {
  const r = resolveDiagram(input);
  if (!r.args) throw new Error(`diagram rejected: ${r.reason}`);
  if (r.notes.length) console.warn(r.notes.join("\n"));
  return r.args;
};

// p. 10: hypothalamus → pituitary (FSH, LH) → gonads → sex hormones, and the hormones brake the chain.
const chain = resolved({
  id: "cadeia_hormonios",
  column: "visuals",
  title: "Os três andares e o freio (retroalimentação)",
  frame: "wide",
  shapes: [
    { id: "hipotalamo", kind: "rect", x: 6, y: 4, w: 46, h: 16, label: "Hipotálamo", fill: "soft" },
    { id: "hipofise", kind: "rect", x: 6, y: 38, w: 46, h: 16, label: "Hipófise", fill: "soft" },
    { id: "gonadas", kind: "rect", x: 6, y: 72, w: 46, h: 16, label: "Gônadas", fill: "soft" },
    { id: "hormonios", kind: "rect", x: 84, y: 72, w: 70, h: 16, label: "Hormônios sexuais", fill: "soft", color: "blue" },
    { id: "estimula", kind: "arrow", from: { at: [20, 20] }, to: [20, 38], color: "green" },
    { id: "estimula_txt", kind: "text", at: [36, 29], text: "estimula", size: "m", color: "green" },
    { id: "fsh_lh", kind: "arrow", from: { at: [20, 54] }, to: [20, 72], color: "green" },
    { id: "fsh_lh_txt", kind: "text", at: [37, 63], text: "FSH e LH", size: "m", color: "green" },
    { id: "produz", kind: "arrow", from: { at: [52, 80] }, to: [84, 80], color: "green" },
    { id: "volta", kind: "line", from: [119, 72], to: [119, 12], dashed: true, color: "red" },
    { id: "freio_topo", kind: "arrow", from: { at: [119, 12] }, to: [52, 12], color: "red" },
    { id: "freio_meio", kind: "arrow", from: { at: [119, 46] }, to: [52, 46], color: "red" },
    { id: "freio_txt", kind: "text", at: [86, 29], text: "freio", size: "m", color: "red" },
    { id: "efeito", kind: "text", at: [119, 96], text: "efeito: mudanças da puberdade", size: "s", color: "blue" },
  ],
});

// p. 10: glucose after a meal rises, insulin brings it back to the healthy range. Qualitative: no numbers.
const glucose = resolved({
  id: "grafico_glicose",
  column: "visuals",
  title: "Glicose no sangue depois do almoço (esquema, sem números)",
  frame: "wide",
  shapes: [
    { id: "eixos", kind: "axes", x_range: [0, 12], y_range: [0, 11], x_ticks: [], y_ticks: [], x_label: "tempo", y_label: "glicose no sangue" },
    { id: "faixa_alta", kind: "line", from: [0, 5.2], to: [12, 5.2], dashed: true, color: "green" },
    { id: "faixa_baixa", kind: "line", from: [0, 2.8], to: [12, 2.8], dashed: true, color: "green" },
    {
      id: "curva",
      kind: "polyline",
      smooth: true,
      color: "red",
      points: [[0, 4], [2, 4], [3, 5.6], [4, 7.6], [5, 8.2], [6, 7.6], [7, 6], [8, 4.6], [9, 4.1], [12, 4]],
    },
    { id: "almoco", kind: "point", at: [2, 4], color: "ink" },
    { id: "almoco_txt", kind: "text", at: [2, 1.6], text: "almoço", size: "s" },
    { id: "insulina", kind: "point", at: [5, 8.2], label: "pâncreas libera insulina", color: "blue" },
    { id: "normal", kind: "point", at: [9, 4.1], color: "green" },
    { id: "normal_txt", kind: "text", at: [9, 1.6], text: "volta ao normal", size: "s", color: "green" },
    { id: "faixa_txt", kind: "text", at: [10.4, 6.2], text: "faixa saudável", size: "s", color: "green" },
  ],
});

const actions: Action[] = [
  {
    id: "b0",
    name: "speak",
    args: {
      text: "Bora ver como o corpo manda mensagens sem usar nervos? Olha o quadro!",
      purpose: "explain",
    },
  },
  {
    id: "b1",
    name: "write_text",
    args: {
      id: "endocrino_resumo",
      column: "main",
      html: "<h2>Hormônios: mensagens pelo sangue</h2><p>O <b>sistema endócrino</b> é formado por <b>glândulas endócrinas</b>, que lançam <b>hormônios</b> direto no sangue.</p><ul><li>O sangue leva o hormônio a todo o corpo.</li><li>Mas ele só age nos <b>órgãos-alvo</b>: células com receptores que o reconhecem.</li><li>A <b>hipófise</b> é a \"glândula mestra\": controla a tireoide, as adrenais e as gônadas.</li></ul>",
      sources: [
        cite(9, "órgãos que produzem substâncias chamadas hormônios e as lançam diretamente no sangue"),
        cite(9, "Ela é chamada muitas vezes de \"glândula mestra\""),
      ],
    },
  },
  { id: "b2", name: "draw", args: { id: "corpo_glandulas", column: "visuals", prompt: "Silhueta do corpo humano com as principais glândulas endócrinas", is_structured: false, max_dimensions: { w: 460, h: 540 } } },
  {
    id: "b3",
    name: "speak",
    args: {
      text: "Cada glândula fica num lugar do corpo, mas o hormônio viaja pelo sangue e só age onde tem receptor.",
      purpose: "explain",
      sources: [cite(9, "cada hormônio só age nas células que têm receptores capazes de reconhecê-lo")],
    },
  },
  { id: "b4", name: "highlight", args: { target_id: "endocrino_resumo", color: "yellow", text_to_match: "direto no sangue" } },
  { id: "b5", name: "highlight", args: { target_id: "endocrino_resumo", color: "pink", text_to_match: "órgãos-alvo" } },
  { id: "b6", name: "circle_annotate", args: { target_id: "endocrino_resumo", text_to_match: "glândula mestra", color: "red" } },
  { id: "b7", name: "draw_diagram", args: { ...chain } },
  {
    id: "b8",
    name: "speak",
    args: {
      text: "O hipotálamo estimula a hipófise, que manda FSH e LH para as gônadas. Quando os hormônios sexuais sobem, eles freiam o começo da cadeia.",
      purpose: "explain",
      sources: [cite(10, "Quando a taxa de hormônios sexuais no sangue aumenta, o hipotálamo e a hipófise \"percebem\" e reduzem sua estimulação.")],
    },
  },
  { id: "b9", name: "circle_annotate", args: { target_id: "cadeia_hormonios", text_to_match: "freio", color: "red" } },
  { id: "b10", name: "highlight", args: { target_id: "cadeia_hormonios", color: "yellow", shape_id: "hipofise" } },
  { id: "b11", name: "draw_result", args: { element_id: "corpo_glandulas", url: "/demo/biology-glandulas.svg" } },
  {
    id: "b12",
    name: "write_text",
    args: {
      id: "glicose_passos",
      column: "main",
      html: "<h3>Retroalimentação negativa: a glicose</h3><ol><li>Depois do almoço, a glicose no sangue sobe.</li><li>O pâncreas libera mais insulina.</li><li>As células absorvem glicose; o fígado guarda uma parte.</li><li>A glicose volta ao normal.</li><li>O pâncreas reduz a insulina.</li></ol><p>O <b>efeito freia a causa</b>: assim o corpo mantém o equilíbrio interno, a <b>homeostase</b>.</p>",
      sources: [
        cite(10, "O pâncreas percebe esse aumento e libera mais insulina no sangue."),
        cite(10, "Esse tipo de controle, em que o efeito freia a causa, é chamado de retroalimentação negativa"),
      ],
    },
  },
  { id: "b13", name: "highlight", args: { target_id: "glicose_passos", color: "green", text_to_match: "efeito freia a causa" } },
  { id: "b14", name: "draw_diagram", args: { ...glucose } },
  {
    id: "b15",
    name: "speak",
    args: {
      text: "No gráfico, a glicose sobe depois do almoço, a insulina entra em ação e ela volta para a faixa saudável.",
      purpose: "explain",
      sources: [cite(10, "Assim, a quantidade de glicose fica dentro de uma faixa saudável ao longo do dia.")],
    },
  },
  { id: "b16", name: "circle_annotate", args: { target_id: "grafico_glicose", text_to_match: "volta ao normal", color: "green" } },
  { id: "b17", name: "highlight", args: { target_id: "glicose_passos", color: "blue", text_to_match: "homeostase" } },
  {
    id: "b18",
    name: "ask_verification",
    args: {
      id: "q_glucagon",
      column: "main",
      verification_id: "ver_demo_bio",
      concept: "Retroalimentação negativa",
      concept_key: "retroalimentacao negativa",
      question: "E se você ficar muitas horas sem comer? O que acontece com a glicose, que hormônio o pâncreas libera e o que o fígado faz?",
      kind: "transfer",
    },
  },
  { id: "b19", name: "speak", args: { text: "Agora é com você: tenta responder no quadro!", purpose: "question" } },
];

const messages = actions.map((action, order) => ({ at_ms: order * 120, message: { type: "action" as const, order, action } }));
messages.push(
  { at_ms: actions.length * 120, message: { type: "script_done", turn_id: "demo_turn_bio" } as never },
  { at_ms: actions.length * 120 + 20, message: { type: "turn_done", turn_id: "demo_turn_bio" } as never },
);
const fixture = FixtureTurn.parse({
  description: "Demo board (Biologia): hormones and negative feedback with a glands image, the hypothalamus → pituitary → gonads chain, a qualitative glucose chart, circles, highlights and citations. Scripted, not recorded.",
  messages,
});
writeFileSync(resolve(root, "fixtures/turns/demo-board-biology.json"), `${JSON.stringify(fixture, null, 1)}\n`);
console.log("wrote fixtures/turns/demo-board-biology.json");
