export {};

// Usage: `pnpm turn:bench [runs]` (latency), or `pnpm turn:bench board` (D78: the board only when the reply continues
// the lesson on it; also the pace of questions and pictures). BENCH_STUDENT sets the student id of the board session.
const API = process.env.API_URL ?? "http://localhost:4000";
const MODE = process.argv[2] === "board" ? "board" : "latency";
const RUNS = MODE === "board" ? 1 : Number(process.argv[2] ?? 3);

const script = [
  { modality: "text", appended: [] },
  { modality: "text", appended: [{ name: "user_message", kind: "chat", text: "Quero aprender sobre o fim da República romana." }] },
  { modality: "text", appended: [{ name: "user_message", kind: "chat", text: "Quem foi Augusto?" }] },
];

const q = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : NaN);

async function streamTurn(sessionId: string, body: unknown) {
  const t0 = performance.now();
  const res = await fetch(`${API}/api/sessions/${sessionId}/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error(`turn failed: HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const seen: { type: string; at: number; data: unknown }[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      const type = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (type && data) seen.push({ type, at: performance.now() - t0, data: JSON.parse(data) });
    }
  }
  return seen;
}

async function runTurn(sessionId: string, body: unknown) {
  const seen = await streamTurn(sessionId, body);
  return {
    first_action: seen.find((m) => m.type === "action")?.at ?? NaN,
    script_done: seen.find((m) => m.type === "script_done")?.at ?? NaN,
    turn_done: seen.find((m) => m.type === "turn_done")?.at ?? NaN,
    errors: seen.filter((m) => m.type === "error").length,
  };
}

if (MODE === "latency") await latencyBench();

async function latencyBench() {
  const rows: Record<string, number[]> = { first_action: [], script_done: [], turn_done: [] };
  let errors = 0;
  for (let r = 1; r <= RUNS; r++) {
    const created = await fetch(`${API}/api/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ student_id: "bench", modality: "text" }) });
    const { id } = (await created.json()) as { id: string };
    await new Promise((res) => setTimeout(res, 1500)); // let the cache pre-warm finish
    for (const [n, body] of script.entries()) {
      const t = await runTurn(id, body);
      errors += t.errors;
      for (const k of Object.keys(rows)) rows[k]!.push(t[k as keyof typeof t] as number);
      console.log(`session ${r} turn ${n + 1}: first action ${t.first_action.toFixed(0)} ms, script done ${t.script_done.toFixed(0)} ms, turn done ${t.turn_done.toFixed(0)} ms`);
    }
  }
  console.log("\nTargets (spec §1): first action p50 ≤ 1500 ms, p95 ≤ 2200 ms");
  for (const [k, xs] of Object.entries(rows)) console.log(`${k.padEnd(13)} p50 ${q(xs, 0.5).toFixed(0)} ms, p95 ${q(xs, 0.95).toFixed(0)} ms (n=${xs.length})`);
  console.log(`errors: ${errors}`);
}

// ---- Board-relevance mode (D78) ----
// The board gets text only when the reply continues the lesson on it; side questions get a spoken answer; the
// student can ask to put something on the board. Targets per category (board = any board action, pointing included):
//   teaching ≥ 90 %, side (meta, off_topic, clarification) ≤ 20 %, board_request 100 % (and it writes something);
//   ack and dont_know are reported without a target.

type Category = "teaching" | "meta" | "off_topic" | "clarification" | "board_request" | "ack" | "dont_know";
const boardScript: [Category, string][] = [
  ["teaching", "Quero aprender sobre a Independência do Brasil."],
  ["ack", "Entendi."],
  ["teaching", "Quem foi Dom Pedro I?"],
  ["off_topic", "Você gosta de futebol?"],
  ["dont_know", "Não sei."],
  ["meta", "Posso te perguntar uma coisa?"],
  ["off_topic", "Por que o céu é azul?"],
  ["teaching", "Por que a Corte portuguesa veio para o Rio em 1808?"],
  ["clarification", "Não entendi, o que quer dizer Corte?"],
  ["board_request", "Anota isso no quadro."],
  ["off_topic", "Qual é o seu nome?"],
  ["teaching", "Beleza, continua."],
  ["teaching", "E o que aconteceu depois do Grito do Ipiranga?"],
  ["dont_know", "Hmm, não sei não."],
  ["off_topic", "Me conta uma piada."],
  ["clarification", "O que quer dizer a palavra regente?"],
  ["board_request", "Coloca isso no quadro."],
  ["teaching", "Como foi o Primeiro Reinado?"],
  ["meta", "Obrigado!"],
  ["off_topic", "Tô com fome."],
  ["teaching", "E a Constituição de 1824, o que ela dizia?"],
  ["meta", "Valeu, você explica bem."],
];
const TARGETS: Partial<Record<Category, { max?: number; min?: number }>> = {
  teaching: { min: 90 }, meta: { max: 20 }, off_topic: { max: 20 }, clarification: { max: 20 }, board_request: { min: 100 },
};

const BOARD = new Set(["write_text", "write_timeline", "draw", "draw_diagram", "update_element", "circle_annotate", "highlight"]);
const TEXT = new Set(["write_text", "write_timeline"]);
const CREATES = new Set(["write_text", "write_timeline", "draw", "draw_diagram"]);
type SeenAction = { at: number; name: string; args: Record<string, unknown> };

async function boardBench() {
  const subjects = (await (await fetch(`${API}/api/subjects`)).json()) as { subjects: { id: string; key: string }[] };
  const subject_id = subjects.subjects.find((s) => s.key === "history")?.id ?? null;
  const created = await fetch(`${API}/api/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ student_id: process.env.BENCH_STUDENT ?? "debug-pace", modality: "voice", subject_id }) });
  const { id } = (await created.json()) as { id: string };
  console.log(`session ${id} (subject ${subject_id ?? "free"})`);
  await new Promise((res) => setTimeout(res, 1500)); // let the cache pre-warm finish

  const turns: { cat: Category; board: number; fallback: boolean; creates: boolean; firstBoard: number; speaks: number; questions: number; endsInQuestion: boolean; draws: number; texts: number; completed: boolean }[] = [];
  for (const [n, [cat, text]] of boardScript.entries()) {
    const seen = await streamTurn(id, { modality: "voice", appended: [{ name: "user_message", kind: "speech", text }] });
    const acts: SeenAction[] = seen.flatMap((m) => {
      const d = m.data as { action?: { name: string; args: Record<string, unknown> } };
      return m.type === "action" && d.action ? [{ at: m.at, name: d.action.name, args: d.action.args }] : [];
    });
    // The Plan C card (removed by D78) is still counted, so the run against the old engine is comparable.
    const isFallback = (a: SeenAction) => a.name === "write_text" && String(a.args.id ?? "").startsWith("board_fallback_");
    const board = acts.filter((a) => BOARD.has(a.name));
    // A question is a speak with a question mark, or a verification card.
    const asks = (a: SeenAction) => a.name === "ask_verification" || (a.name === "speak" && String(a.args.text ?? "").includes("?"));
    const voiced = acts.filter((a) => a.name === "speak" || a.name === "ask_verification");
    const t = {
      cat, board: board.length, fallback: board.some(isFallback), creates: board.some((a) => CREATES.has(a.name)),
      firstBoard: board[0]?.at ?? NaN, speaks: acts.filter((a) => a.name === "speak").length, questions: acts.filter(asks).length,
      endsInQuestion: voiced.length > 0 && asks(voiced.at(-1)!),
      draws: acts.filter((a) => a.name === "draw").length, texts: board.filter((a) => TEXT.has(a.name) && !isFallback(a)).length,
      completed: seen.some((m) => m.type === "turn_done"),
    };
    turns.push(t);
    const spoken = acts.filter((a) => a.name === "speak").map((a) => String(a.args.text)).join(" / ");
    console.log(`${String(n + 1).padStart(2)} [${cat}] "${text}" -> board ${t.board}${t.fallback ? " (fallback card)" : ""} (${board.map((a) => a.name).join(",") || "none"}), speaks ${t.speaks}, questions ${t.questions}${t.endsInQuestion ? " (ends in ?)" : ""}, draws ${t.draws}/${t.texts} text${t.completed ? "" : ", NOT completed"}\n     ${spoken.slice(0, 220)}`);
  }

  const done = turns.filter((t) => t.completed);
  const pctOf = (k: number, n: number) => `${((100 * k) / Math.max(1, n)).toFixed(0)} %`;
  const firsts = done.map((t) => t.firstBoard).filter((x) => !Number.isNaN(x));
  console.log(`\ncompleted turns      ${done.length}/${turns.length}`);
  console.log("per category (board = any board action; writes = creates an element; target in brackets)");
  for (const cat of new Set(boardScript.map(([c]) => c))) {
    const ts = done.filter((t) => t.cat === cat);
    const rate = (100 * ts.filter((t) => t.board > 0).length) / Math.max(1, ts.length);
    const target = TARGETS[cat];
    const goal = target?.min !== undefined ? `≥ ${target.min} %` : target?.max !== undefined ? `≤ ${target.max} %` : "none";
    const ok = target ? ((target.min === undefined || rate >= target.min) && (target.max === undefined || rate <= target.max) ? "ok" : "MISS") : "";
    const speaks = (ts.reduce((n, t) => n + t.speaks, 0) / Math.max(1, ts.length)).toFixed(1);
    console.log(`  ${cat.padEnd(13)} board ${ts.filter((t) => t.board > 0).length}/${ts.length} = ${rate.toFixed(0)} % [${goal}] ${ok}, writes ${ts.filter((t) => t.creates).length}, fallback ${ts.filter((t) => t.fallback).length}, speaks/reply ${speaks}`);
  }
  console.log(`first board action   p50 ${q(firsts, 0.5).toFixed(0)} ms, p90 ${q(firsts, 0.9).toFixed(0)} ms (n=${firsts.length})`);
  const sum = (k: "questions" | "draws" | "texts") => done.reduce((n, t) => n + t[k], 0);
  const per = (k: "questions" | "draws" | "texts") => (sum(k) / Math.max(1, done.length)).toFixed(2);
  console.log(`pace (D77): ≤ 1 question per reply, ≤ 1 draw per reply, draws ≤ text blocks`);
  console.log(`questions per reply  ${per("questions")} (2+ in ${done.filter((t) => t.questions >= 2).length} replies)`);
  console.log(`ends in a question   ${pctOf(done.filter((t) => t.endsInQuestion).length, done.length)}`);
  console.log(`draws per reply      ${per("draws")} (max ${Math.max(0, ...done.map((t) => t.draws))})`);
  console.log(`draws / text blocks  ${sum("draws")}/${sum("texts")} = ${(sum("draws") / Math.max(1, sum("texts"))).toFixed(2)}`);
}

if (MODE === "board") await boardBench();
