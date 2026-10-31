/* eslint-disable @typescript-eslint/no-explicit-any -- ad-hoc JSON from the API under test */
// Owner: Person 1. `pnpm e2e:teacher`: the whole teacher backend against a real MongoDB database (mento_e2e, dropped at the end).
// seed --reset → seed:lab --analyze → the real API over HTTP → PDF upload → teacher decisions.
import { execFileSync } from "node:child_process";
import mongoose from "mongoose";
import { makeTestPdf } from "@mento/sources";
import { buildApp } from "../apps/api/src/app";
import { loadConfig } from "../apps/api/src/config";
import { parseArgs } from "./lib/db";

const DB = "mento_e2e";
const args = parseArgs(process.argv.slice(2));
const keep = args.flags.has("keep");
const run = (script: string, ...flags: string[]) => execFileSync("pnpm", ["exec", "tsx", `scripts/${script}`, ...flags, "--db", DB], { stdio: ["ignore", "pipe", "inherit"] }).toString();

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → ${JSON.stringify(detail)}`}`);
}

console.log(`# 1. seed --reset and seed:lab --analyze on database "${DB}"`);
run("seed.ts", "--reset");
const labOut = run("seed-lab.ts", "--analyze");
check("8 conversations analyzed (done)", (labOut.match(/: done/g) ?? []).length === 8, labOut);

const config = loadConfig({ ...process.env, LOG_LEVEL: "silent", MONGODB_DB: DB } as NodeJS.ProcessEnv);
const app = await buildApp(config);
await app.container.mongo.connect();
await app.listen({ port: 0, host: "127.0.0.1" });
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}/api`;
const get = async (path: string) => (await fetch(base + path)).json() as Promise<any>;
const send = (method: string, path: string, body?: unknown) =>
  fetch(base + path, { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const until = async (what: string, fn: () => Promise<boolean>) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  check(`timeout waiting for ${what}`, false);
  return false;
};

try {
  console.log("\n# 2. the API over HTTP");
  check("health: MongoDB connected", (await get("/health")).mongo === "connected");
  const overview = await get("/overview");
  check("overview: 6 students (5 simulated), 8 conversations", overview.students.total === 6 && overview.students.simulated === 5 && overview.conversations === 8, overview);
  check("overview: 17 insights, 5 open gaps, severity 1/4/5", overview.insights.total === 17 && overview.insights.gaps_open === 5 && JSON.stringify(overview.insights.by_severity) === JSON.stringify({ critical: 1, medium: 4, positive: 5 }), overview.insights);

  const rows = await get("/students");
  const id = (name: string) => rows.find((r: any) => r.name === name).id as string;
  const ana = await get(`/students/${id("Ana Souza")}`);
  check("Ana: profile and school history are shown", ana.student.profile.class_name === "8º A" && ana.student.school_history.length === 2, ana.student.profile);
  check("Ana: summary links the topic to the root cause", /Formas de governo/.test(ana.latest_analysis.summary) && /Lição 2/.test(ana.latest_analysis.summary), ana.latest_analysis);
  const anaInsights = await get(`/students/${id("Ana Souza")}/insights`);
  const gap = anaInsights.critical.find((i: any) => i.kind === "gap");
  check("Ana: critical gap, recurring, root cause Lição 2, with her own words", gap.rule === "R3_recurring" && gap.root_cause.lesson_id === "L2" && gap.evidence.some((e: any) => /rei é eleito/.test(e.quote)), gap);
  check("Carla: root cause is Lição 6", (await get(`/students/${id("Carla Mendes")}/insights`)).medium.some((i: any) => i.kind === "gap" && i.root_cause?.lesson_id === "L6"));
  check("Bruno: nothing open, two positives", JSON.stringify((await get(`/students/${id("Bruno Lima")}/insights`)).counts) === JSON.stringify({ critical: 0, medium: 0, positive: 2 }));
  check("Eduarda: no insights", (await get(`/students/${id("Eduarda Rocha")}/insights`)).counts.positive === 0);
  check("Lucas (live demo student): empty", (await get(`/students/${id("Lucas Ferreira")}`)).conversations === 0);

  console.log("\n# 3. teacher decisions and re-analysis");
  const patched = await (await send("PATCH", `/insights/${gap.id}`, { status: "dismissed" })).json() as any;
  check("dismiss the critical gap", patched.status === "dismissed");
  const after = await get("/overview");
  check("dismissed gap leaves the open counts and the suggestion follows", after.insights.by_severity.critical === 0 && after.insights.gaps_open === 4, after.insights);
  check("re-running a finished analysis is cached (202, still done)", (await send("POST", "/sessions/ses_ana_02/analysis")).status === 202 && (await get("/sessions/ses_ana_02/analysis")).status === "done");
  await send("POST", "/sessions/ses_ana_02/analysis?force=true");
  const forced = await until("forced analysis", async () => {
    const a = await get("/sessions/ses_ana_02/analysis");
    return a.attempts === 2 && a.status === "done";
  });
  if (!forced) console.log("  last state:", JSON.stringify(await get("/sessions/ses_ana_02/analysis")).slice(0, 400));
  check("forced re-analysis does not reopen the dismissed gap", (await get(`/students/${id("Ana Souza")}/insights`)).critical.length === 0);

  console.log("\n# 4. class context");
  check("a description naming a student is rejected (422)", (await send("PUT", "/class-context", { grade_level: "8º ano", description: "O Diego se distrai." })).status === 422);
  check("a valid description is saved", (await send("PUT", "/class-context", { grade_level: "9º ano", description: "Turma de 9º ano, gosta de debates." })).status === 200 && (await get("/class-context")).grade_level === "9º ano");

  console.log("\n# 5. material upload → ingestion");
  const pdf = makeTestPdf([
    "Capítulo 1 — Fundação de Roma\nSegundo a lenda, Roma foi fundada em 753 a.C. por Rômulo e Remo e governada por sete reis.",
    "Capítulo 2 — A República\nO fim da República aconteceu quando Otávio recebeu o título de Augusto, em 27 a.C.",
  ]);
  const form = new FormData();
  form.set("title", "Livro de teste");
  form.set("subject", "História");
  form.set("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "livro.pdf");
  const upload = await fetch(base + "/materials", { method: "POST", body: form });
  const { id: materialId } = (await upload.json()) as any;
  check("upload accepted (202, queued)", upload.status === 202);
  await until("ingestion", async () => (await get(`/materials/${materialId}`)).status === "ready");
  const material = await get(`/materials/${materialId}`);
  check("material ready with 2 pages, outline and sequence", material.page_count === 2 && material.outline.length === 2 && material.sequence.length === 2, material);
  const chunkHits = await mongoose.connection.db!.collection("teacherchunks").find({ material_id: materialId, $text: { $search: "fim república" } }).toArray();
  check("Portuguese text search finds the page of 'fim da república'", chunkHits[0]?.page === 2, chunkHits.map((c) => c.page));
  const range = await fetch(`${base}/files/${materialId}`, { headers: { range: "bytes=0-4" } });
  check("PDF served with Range (206, %PDF-)", range.status === 206 && (await range.text()) === "%PDF-");
  const again = await fetch(base + "/materials", { method: "POST", body: form });
  check("same file again is a duplicate (200)", again.status === 200 && ((await again.json()) as any).duplicate === true);
} finally {
  await app.close();
  if (!keep) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

console.log(failures === 0 ? "\nAll end-to-end checks passed." : `\n${failures} end-to-end check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
