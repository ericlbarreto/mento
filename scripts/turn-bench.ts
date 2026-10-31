export {};

// Usage: `pnpm turn:bench [runs]` (latency), or `pnpm turn:bench board` (Plan C: every reply writes or draws on the board).
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

// ---- Board-rule mode (Plan C) ----

type Category = "teaching" | "meta" | "off_topic" | "clarification" | "dont_know";
const boardScript: [Category, string][] = [
  ["teaching", "Quero aprender sobre o fim da República romana."],
  ["meta", "Entendi."],
  ["teaching", "Quem foi Júlio César?"],
  ["off_topic", "Você gosta de futebol?"],
  ["dont_know", "Não sei."],
  ["meta", "Posso te perguntar uma coisa?"],
  ["teaching", "Por que o Senado tinha medo dele?"],
  ["clarification", "Não entendi, o que é ditador?"],
  ["off_topic", "Qual é o seu nome?"],
  ["meta", "Beleza, continua."],
  ["teaching", "E o que aconteceu depois que ele morreu?"],
  ["dont_know", "Hmm, não sei não."],
  ["off_topic", "Me conta uma piada."],
  ["teaching", "Quem foi Augusto?"],
  ["meta", "Manda a dúvida."],
  ["clarification", "Como assim Império? Era diferente da República?"],
  ["off_topic", "Você joga videogame?"],
  ["meta", "Obrigado!"],
  ["teaching", "Como era a vida no Império Romano?"],
  ["off_topic", "Tô com fome."],
];

const BOARD = new Set(["write_text", "write_timeline", "draw", "update_element", "circle_annotate", "highlight"]);
const CREATES = new Set(["write_text", "write_timeline", "draw"]);
type SeenAction = { at: number; name: string; args: Record<string, unknown> };

async function boardBench() {
  const subjects = (await (await fetch(`${API}/api/subjects`)).json()) as { subjects: { id: string; key: string }[] };
  const subject_id = subjects.subjects.find((s) => s.key === "history")?.id ?? null;
  const created = await fetch(`${API}/api/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ student_id: "debug-board-rule", modality: "voice", subject_id }) });
  const { id } = (await created.json()) as { id: string };
  console.log(`session ${id} (subject ${subject_id ?? "free"})`);
  await new Promise((res) => setTimeout(res, 1500)); // let the cache pre-warm finish

  const turns: { cat: Category; native: number; fallback: boolean; createsNative: boolean; firstBoard: number; oneQuestion: boolean; completed: boolean }[] = [];
  for (const [n, [cat, text]] of boardScript.entries()) {
    const seen = await streamTurn(id, { modality: "voice", appended: [{ name: "user_message", kind: "speech", text }] });
    const acts: SeenAction[] = seen.flatMap((m) => {
      const d = m.data as { action?: { name: string; args: Record<string, unknown> } };
      return m.type === "action" && d.action ? [{ at: m.at, name: d.action.name, args: d.action.args }] : [];
    });
    const isFallback = (a: SeenAction) => a.name === "write_text" && String(a.args.id ?? "").startsWith("board_fallback_");
    const board = acts.filter((a) => BOARD.has(a.name));
    const native = board.filter((a) => !isFallback(a));
    const questions = acts.filter((a) => a.name === "ask_verification" || (a.name === "speak" && a.args.purpose === "question"));
    const script = acts.filter((a) => a.name !== "draw_result");
    const last = script.at(-1);
    const oneQuestion = questions.length === 1 && last !== undefined && questions.includes(last);
    const t = {
      cat, native: native.length, fallback: board.some(isFallback), createsNative: native.some((a) => CREATES.has(a.name)),
      firstBoard: board[0]?.at ?? NaN, oneQuestion, completed: seen.some((m) => m.type === "turn_done"),
    };
    turns.push(t);
    const spoken = acts.filter((a) => a.name === "speak").map((a) => String(a.args.text)).join(" / ");
    console.log(`${String(n + 1).padStart(2)} [${cat}] "${text}" -> board ${t.native}${t.fallback ? " +fallback" : ""} (${board.map((a) => a.name).join(",") || "none"}), first board ${t.firstBoard.toFixed(0)} ms, one question ${t.oneQuestion}${t.completed ? "" : ", NOT completed"}\n     ${spoken.slice(0, 220)}`);
  }

  const done = turns.filter((t) => t.completed);
  const pct = (k: number) => `${((100 * k) / Math.max(1, done.length)).toFixed(0)} %`;
  const firsts = done.map((t) => t.firstBoard).filter((x) => !Number.isNaN(x));
  console.log(`\nTargets (Plan C): native ≥ 90 %, with fallback 100 %, silent teaching 0, first board p50 ≤ 2500 ms / p90 ≤ 4000 ms, one question 100 %`);
  console.log(`completed turns      ${done.length}/${turns.length}`);
  console.log(`native board rate    ${pct(done.filter((t) => t.native > 0).length)}`);
  console.log(`fallback rate        ${pct(done.filter((t) => t.fallback).length)}`);
  console.log(`board (any) rate     ${pct(done.filter((t) => t.native > 0 || t.fallback).length)}`);
  console.log(`creates vs points    ${done.filter((t) => t.createsNative).length} create an element, ${done.filter((t) => t.native > 0 && !t.createsNative).length} only point`);
  console.log(`silent teaching      ${done.filter((t) => t.cat === "teaching" && t.native === 0 && !t.fallback).length}`);
  console.log(`first board action   p50 ${q(firsts, 0.5).toFixed(0)} ms, p90 ${q(firsts, 0.9).toFixed(0)} ms (n=${firsts.length})`);
  console.log(`exactly one question ${pct(done.filter((t) => t.oneQuestion).length)}`);
  for (const cat of new Set(boardScript.map(([c]) => c))) {
    const ts = done.filter((t) => t.cat === cat);
    console.log(`  ${cat.padEnd(13)} native ${ts.filter((t) => t.native > 0).length}/${ts.length}, fallback ${ts.filter((t) => t.fallback).length}`);
  }
}

if (MODE === "board") await boardBench();
