export {};

const API = process.env.API_URL ?? "http://localhost:4000";
const RUNS = Number(process.argv[2] ?? 3);

const script = [
  { modality: "text", appended: [] },
  { modality: "text", appended: [{ name: "user_message", kind: "chat", text: "Quero aprender sobre o fim da República romana." }] },
  { modality: "text", appended: [{ name: "user_message", kind: "chat", text: "Quem foi Augusto?" }] },
];

const q = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : NaN);

async function runTurn(sessionId: string, body: unknown) {
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
  return {
    first_action: seen.find((m) => m.type === "action")?.at ?? NaN,
    script_done: seen.find((m) => m.type === "script_done")?.at ?? NaN,
    turn_done: seen.find((m) => m.type === "turn_done")?.at ?? NaN,
    errors: seen.filter((m) => m.type === "error").length,
  };
}

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