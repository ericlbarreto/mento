// Builds fixtures/turns/demo-board-history.json: a scripted, demo-ready board (História do Brasil — da Corte à
// Regência) with two hand-drawn images, a timeline, a cause → consequence diagram, circles, highlights and citations.
// Run: pnpm exec tsx scripts/demo-board-history.ts
// Images are hand-drawn SVGs in apps/web/public/demo (no image API needed). Quotes are verbatim from the pages of the
// material "História do Brasil — Da crise colonial ao Segundo Reinado" as ingested in the dev database.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FixtureTurn, type Action, type Citation } from "@mento/contracts";
import { resolveDiagram } from "../packages/tutor/src/diagram/resolve";

const root = resolve(import.meta.dirname, "..");

/** Material id of "História do Brasil — Da crise colonial ao Segundo Reinado" (GET /api/materials). */
const MATERIAL_ID = "6ae58b99b00177f12a4d5079";
const cite = (page: number, quote: string): Citation => ({ material_id: MATERIAL_ID, page, quote });

const resolved = (input: unknown) => {
  const r = resolveDiagram(input);
  if (!r.args) throw new Error(`diagram rejected: ${r.reason}`);
  if (r.notes.length) console.warn(r.notes.join("\n"));
  return r.args;
};

// Cause → consequence chart of the book's table (p. 14): three causes, the Independence, three consequences.
const box = (id: string, cx: number, y: number, w: number, title: string, sub: string, color: "blue" | "red" | "green") => [
  { id, kind: "rect", x: cx - w / 2, y, w, h: 20, label: title, fill: "soft", color },
  { id: `${id}_s`, kind: "text", at: [cx, y + 16.5], text: sub, size: "s", color },
];
const causes = resolved({
  id: "causas_consequencias",
  column: "visuals",
  title: "Causas e consequências da Independência",
  frame: "wide",
  shapes: [
    { id: "h_causas", kind: "text", at: [80, 5.5], text: "CAUSAS", size: "s", color: "blue" },
    ...box("portos", 27, 9, 48, "Portos abertos", "1808", "blue"),
    ...box("reino", 80, 9, 48, "Reino Unido", "1815", "blue"),
    ...box("cortes", 133, 9, 48, "Recolonização", "Cortes, 1821", "blue"),
    ...box("independencia", 80, 39, 68, "Independência", "7 de setembro de 1822", "red"),
    ...box("imperio", 27, 69, 48, "Império", "D. Pedro I", "green"),
    ...box("escravidao", 80, 69, 48, "Escravidão", "foi mantida", "green"),
    ...box("guerras", 133, 69, 48, "Guerras", "1822 a 1824", "green"),
    { id: "a1", kind: "arrow", from: { ref: "portos", side: "bottom" }, to: [62, 38.5], color: "ink" },
    { id: "a2", kind: "arrow", from: { ref: "reino", side: "bottom" }, to: [80, 38.5], color: "ink" },
    { id: "a3", kind: "arrow", from: { ref: "cortes", side: "bottom" }, to: [98, 38.5], color: "ink" },
    { id: "a4", kind: "arrow", from: { ref: "independencia", side: "bottom" }, to: [34, 68.5], color: "ink" },
    { id: "a5", kind: "arrow", from: { ref: "independencia", side: "bottom" }, to: [80, 68.5], color: "ink" },
    { id: "a6", kind: "arrow", from: { ref: "independencia", side: "bottom" }, to: [126, 68.5], color: "ink" },
    { id: "h_consequencias", kind: "text", at: [80, 93.5], text: "CONSEQUÊNCIAS", size: "s", color: "green" },
  ],
});

const actions: Action[] = [
  {
    id: "h0",
    name: "speak",
    args: {
      text: "Vamos ver como o Brasil deixou de ser colônia? Tudo começa em 1808, quando a Corte portuguesa chega ao Rio de Janeiro.",
      purpose: "explain",
      sources: [cite(7, "Em 8 de março de 1808, D. João chegou ao Rio de Janeiro, que se tornou a sede do governo português.")],
    },
  },
  {
    id: "h1",
    name: "write_text",
    args: {
      id: "da_corte_a_independencia",
      column: "main",
      html:
        "<h2>Da Corte à Independência</h2>" +
        "<p>Fugindo de Napoleão, D. João trouxe a <b>Corte portuguesa</b> para o Brasil. Ainda em 1808, ele <b>abriu os portos</b> às nações amigas: era o fim do monopólio de Portugal.</p>" +
        "<ul><li><b>1815:</b> o Brasil vira <b>Reino Unido</b> a Portugal e Algarves e deixa de ser colônia.</li>" +
        "<li><b>1821:</b> as Cortes de Lisboa querem a <b>recolonização</b>; D. João VI volta e D. Pedro fica como regente.</li>" +
        "<li><b>9 de janeiro de 1822:</b> o <b>Dia do Fico</b>.</li>" +
        "<li><b>7 de setembro de 1822:</b> o <b>Grito do Ipiranga</b>, às margens do riacho, em São Paulo.</li></ul>",
      sources: [
        cite(7, "abria os portos do Brasil às nações amigas de Portugal"),
        cite(9, "Em 16 de dezembro de 1815, D. João elevou o Brasil à categoria de reino"),
        cite(11, "Em 9 de janeiro de 1822, D. Pedro anunciou que ficaria no Brasil, contrariando a ordem das Cortes."),
        cite(12, "Em 7 de setembro de 1822, às margens do riacho do Ipiranga, em São Paulo, D. Pedro recebeu essas cartas e declarou o rompimento com Portugal."),
      ],
    },
  },
  { id: "h2", name: "draw", args: { id: "navio_1808", column: "visuals", prompt: "A frota da Corte portuguesa chegando ao Rio de Janeiro em 1808", is_structured: false, max_dimensions: { w: 520, h: 390 } } },
  { id: "h3", name: "highlight", args: { target_id: "da_corte_a_independencia", color: "yellow", text_to_match: "abriu os portos" } },
  {
    id: "h4",
    name: "write_timeline",
    args: {
      id: "linha_imperio",
      column: "main",
      events: [
        { date: "1808", label: "A Corte chega ao Rio e os portos são abertos" },
        { date: "1815", label: "Brasil elevado a Reino Unido a Portugal e Algarves" },
        { date: "1822", label: "Dia do Fico (9/1) e Grito do Ipiranga (7/9)" },
        { date: "1824", label: "D. Pedro I outorga a Constituição (25/3)" },
        { date: "1831", label: "D. Pedro I abdica; começa o Período Regencial" },
        { date: "1840", label: "Golpe da Maioridade (23/7) encerra a Regência" },
      ],
    },
  },
  { id: "h5", name: "draw_result", args: { element_id: "navio_1808", url: "/demo/history-navio-1808.svg" } },
  {
    id: "h6",
    name: "speak",
    args: {
      text: "Repare no ano de 1822: é o coração da linha do tempo. Mas a Independência não aconteceu num dia só.",
      purpose: "explain",
      sources: [cite(14, "A Independência do Brasil foi o resultado de um processo que começou bem antes de 1822 e só terminou depois.")],
    },
  },
  { id: "h7", name: "circle_annotate", args: { target_id: "linha_imperio", text_to_match: "1822", color: "red" } },
  { id: "h8", name: "highlight", args: { target_id: "da_corte_a_independencia", color: "pink", text_to_match: "Grito do Ipiranga" } },
  { id: "h9", name: "draw", args: { id: "grito_ipiranga", column: "visuals", prompt: "D. Pedro a cavalo às margens do riacho do Ipiranga, 7 de setembro de 1822", is_structured: false, max_dimensions: { w: 520, h: 390 } } },
  {
    id: "h10",
    name: "write_text",
    args: {
      id: "voce_sabia",
      column: "side",
      html:
        "<h3>Você sabia?</h3><p>A pintura famosa de D. Pedro erguendo a espada foi feita <b>décadas depois</b>. É uma interpretação artística, não um registro fiel daquele dia.</p>" +
        "<p>Pergunte sempre: <b>quem</b> fez a imagem, <b>quando</b> e <b>para quê</b>?</p>",
      sources: [cite(12, "Ela é uma interpretação artística, criada para celebrar a Independência, e não um registro fiel do que aconteceu naquele dia.")],
    },
  },
  { id: "h11", name: "draw_diagram", args: { ...causes } },
  {
    id: "h12",
    name: "speak",
    args: {
      text: "No quadro de causas e consequências, olha a escravidão: o país ficou independente, mas ela foi mantida.",
      purpose: "explain",
      sources: [cite(14, "Interesse das elites em manter o poder e a escravidão")],
    },
  },
  { id: "h13", name: "circle_annotate", args: { target_id: "causas_consequencias", text_to_match: "Escravidão", color: "blue" } },
  { id: "h14", name: "highlight", args: { target_id: "causas_consequencias", color: "yellow", shape_id: "independencia" } },
  { id: "h15", name: "draw_result", args: { element_id: "grito_ipiranga", url: "/demo/history-ipiranga.svg" } },
  {
    id: "h16",
    name: "write_text",
    args: {
      id: "primeiro_reinado_regencia",
      column: "main",
      html:
        "<h3>Depois de 1822: Primeiro Reinado e Regência</h3><ol>" +
        "<li>Em 1824, D. Pedro I <b>outorga</b> a Constituição, com o <b>Poder Moderador</b> nas mãos do imperador.</li>" +
        "<li>Crise, guerra da Cisplatina e inflação: em 7 de abril de 1831, ele <b>abdica</b> em favor do filho de 5 anos.</li>" +
        "<li>De 1831 a 1840, regentes governam e explodem <b>revoltas</b> em várias províncias.</li></ol>",
      sources: [
        cite(16, "O texto foi outorgado em 25 de março de 1824."),
        cite(19, "Em 7 de abril de 1831, D. Pedro I abdicou"),
        cite(20, "O período entre 1831 e 1840 ficou conhecido como Período Regencial"),
      ],
    },
  },
  { id: "h17", name: "highlight", args: { target_id: "primeiro_reinado_regencia", color: "green", text_to_match: "Poder Moderador" } },
  { id: "h18", name: "circle_annotate", args: { target_id: "primeiro_reinado_regencia", text_to_match: "7 de abril de 1831", color: "green" } },
  {
    id: "h19",
    name: "ask_verification",
    args: {
      id: "q_linha_imperio",
      column: "main",
      verification_id: "ver_demo_historia",
      concept: "Cronologia da Independência",
      concept_key: "cronologia da independencia",
      question: "Em que lugar da linha do tempo entra a Revolução Liberal do Porto, que exigiu a volta de D. João VI a Portugal? Diga o ano e entre quais eventos ela fica.",
      kind: "place_on_timeline",
    },
  },
  {
    id: "h20",
    name: "speak",
    args: {
      text: "Agora é com você: encaixa a Revolução do Porto na linha do tempo!",
      purpose: "question",
    },
  },
];

const messages = actions.map((action, order) => ({ at_ms: order * 120, message: { type: "action" as const, order, action } }));
messages.push(
  { at_ms: actions.length * 120, message: { type: "script_done", turn_id: "demo_history_turn" } as never },
  { at_ms: actions.length * 120 + 20, message: { type: "turn_done", turn_id: "demo_history_turn" } as never },
);
const fixture = FixtureTurn.parse({
  description:
    "Demo board (História do Brasil): from the royal court in 1808 to the Regency, with two images, a timeline, a cause → consequence diagram, circles, highlights and citations of the material. Scripted, not recorded.",
  messages,
});
writeFileSync(resolve(root, "fixtures/turns/demo-board-history.json"), `${JSON.stringify(fixture, null, 1)}\n`);
console.log("wrote fixtures/turns/demo-board-history.json");
