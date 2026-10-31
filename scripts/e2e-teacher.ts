/* eslint-disable @typescript-eslint/no-explicit-any -- ad-hoc JSON from the API under test */
// Owner: Person 1. `pnpm e2e:teacher`: the whole teacher backend against a real MongoDB database (mento_e2e, dropped at the end).
// seed --reset → seed:lab --analyze → the real API over HTTP → PDF upload → teacher decisions.
import { execFileSync } from "node:child_process";
import mongoose from "mongoose";
import { MongoRepository } from "@mento/db";
import { FileConversationSource, LAB_CONVERSATIONS_PATH, idMapsFromRepo } from "@mento/analysis";
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
// Parts 1-5 use the lab conversations (a JSON file) for the seeded students; part 6 uses what the tutor stores in MongoDB.
const app = await buildApp(config, { conversations: new FileConversationSource(LAB_CONVERSATIONS_PATH, idMapsFromRepo(new MongoRepository())) });
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

  console.log("\n# 5. upload linked to a subject → embeddings in the vector store");
  const subjectRes = await send("POST", "/subjects", { name: "História (e2e)", key: "history_e2e" });
  const subject = (await subjectRes.json()) as any;
  check("subject created (201)", subjectRes.status === 201 && !!subject.id, subject);
  const pdf = makeTestPdf([
    "Capítulo 1 — Fundação de Roma\nSegundo a lenda, Roma foi fundada em 753 a.C. por Rômulo e Remo e governada por sete reis.",
    "Capítulo 2 — A República\nO fim da República aconteceu quando Otávio recebeu o título de Augusto, em 27 a.C.",
  ]);
  const form = () => {
    const f = new FormData();
    f.set("title", "Livro de teste");
    f.set("subject_id", subject.id);
    f.set("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "livro.pdf");
    return f;
  };
  const noSubject = new FormData();
  noSubject.set("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "livro.pdf");
  check("upload without a subject is refused (400)", (await fetch(base + "/materials", { method: "POST", body: noSubject })).status === 400);
  const wrong = form();
  wrong.set("subject_id", "000000000000000000000000");
  check("upload to an unknown subject is refused (404)", (await fetch(base + "/materials", { method: "POST", body: wrong })).status === 404);

  if (!app.container.embed) {
    const refused = await fetch(base + "/materials", { method: "POST", body: form() });
    check("no VOYAGE_API_KEY: upload answers 503 embeddings_unavailable (embedding part skipped)", refused.status === 503);
  } else {
    const upload = await fetch(base + "/materials", { method: "POST", body: form() });
    const { id: materialId } = (await upload.json()) as any;
    check("upload accepted (202, queued)", upload.status === 202);
    const sawCard = await get(`/subjects/${subject.id}`);
    check("while processing the subject does not list it yet", sawCard.material_count === 0 || (await get(`/materials/${materialId}`)).status === "ready", sawCard);
    await until("ingestion with real Voyage embeddings", async () => ["ready", "failed"].includes((await get(`/materials/${materialId}`)).status));
    const material = await get(`/materials/${materialId}`);
    check("material ready, linked to the subject, with chapters and lesson sequence", material.status === "ready" && material.subject === "history_e2e" && material.subject_id === subject.id && material.pages === 2 && material.chapters.length === 2 && material.sequence.length === 2, material);
    const stored = await mongoose.connection.db!.collection("chunks").find({ material_id: materialId }).toArray();
    check("passages stored in `chunks`, one embedding of 1024 numbers each", stored.length === material.passages && stored.length > 0 && stored.every((c) => c.embedding.length === 1024 && c.subject === "history_e2e"), { passages: stored.length, dims: stored[0]?.embedding?.length });
    const card = await get(`/subjects/${subject.id}`);
    check("the subject card now lists the material", card.material_count === 1 && card.materials[0].id === materialId, card);
    const catalog = await app.container.chunkStore.listCatalog(subject.id);
    check("the tutor's catalog for the subject has the book and its chapters", catalog.length === 1 && catalog[0]!.chapters.length === 2, catalog);
    check("the tutor's citation check accepts a real quote of the uploaded page", await app.container.retriever.validateCitation({ material_id: materialId, page: 2, quote: "O fim da República aconteceu" }));
    const session = await fetch(base + "/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ student_id: "e2e", modality: "text", subject_id: subject.id }) });
    check("a session can start from the subject (201)", session.status === 201, await session.clone().text());
    const range = await fetch(`${base}/files/${materialId}`, { headers: { range: "bytes=0-4" } });
    check("PDF served with Range (206, %PDF-)", range.status === 206 && (await range.text()) === "%PDF-");
    const again = await fetch(base + "/materials", { method: "POST", body: form() });
    check("same file again is a duplicate (200)", again.status === 200 && ((await again.json()) as any).duplicate === true);
  }

  console.log("\n# 6. a conversation stored by the whiteboard is analysed when it ends (no mock)");
  const live = await buildApp(config); // default: the conversations come from MongoDB
  const lucas = (await get("/students")).find((r: any) => r.name === "Lucas Ferreira").id as string;
  const fixture = (await get("/materials")).find((m: any) => m.is_fixture);
  const cite = (page: number) => ({ material_id: fixture.id, page, quote: "trecho do livro" });
  // written exactly like the tutor and the judge write (same repository classes, same payloads)
  const { id: sessionId } = await live.container.repo.createSession({ student_id: lucas, modality: "text", topic: "a crise da República" });
  const add = (type: string, payload: unknown) => live.container.repo.appendEvent(sessionId, { type: type as never, payload });
  await add("user_message", { kind: "chat", text: "como a república virou império?" });
  await add("tutor_action", { turn_id: "turn_1", action_id: "a1", order: 0, name: "speak", args: { text: "Augusto concentrou o poder.", purpose: "explain", sources: [cite(49), cite(50)] } });
  for (const [n, answer] of ["na república o rei é eleito", "o augusto virou presidente"].entries()) {
    const verification_id = `ver_e2e_${n}`;
    await add("tutor_action", { turn_id: "turn_2", action_id: `a${n + 2}`, order: 0, name: "speak", args: { text: "Lembra da república?", purpose: "explain", sources: [cite(22)] } });
    await add("verification_asked", { verification_id, element_id: "q1", concept: "Formas de governo", concept_key: "formas de governo", question: "Qual a diferença?", kind: "explain" });
    await add("verification_answered", { verification_id, element_id: "q1", answer });
    const { id: evidence_id } = await live.container.evidence.insertEvidence({ session_id: sessionId, student_id: lucas, concept: "Formas de governo", concept_key: "formas de governo", result: "incorrect", independent: true, hints_used: 0, rationale: "confunde república com monarquia" });
    await add("evidence_recorded", { evidence_id, verification_id, concept: "Formas de governo", concept_key: "formas de governo", result: "incorrect", independent: true, hints_used: 0, rationale: "confunde república com monarquia" });
  }
  const ended = await live.inject({ method: "POST", url: `/api/sessions/${sessionId}/end`, payload: { reason: "user_left" } });
  check("ending the conversation answers 200 at once", ended.statusCode === 200);
  await live.container.sessionEnded.idle();
  const stored = await live.inject(`/api/sessions/${sessionId}/analysis`);
  check("the analysis ran on the stored conversation (done)", stored.statusCode === 200 && stored.json().status === "done", stored.json());
  const lucasInsights = (await live.inject(`/api/students/${lucas}/insights`)).json() as any;
  const lucasGap = lucasInsights.critical.find((i: any) => i.kind === "gap");
  check("Lucas gets a critical gap whose root cause is the earlier lesson (derived from the cited pages)", lucasGap?.rule === "R1_repeated_errors" && lucasGap.root_cause?.lesson_id === "L2" && lucasGap.studying_lesson_id === "L6", lucasGap && { rule: lucasGap.rule, root: lucasGap.root_cause?.lesson_id, studying: lucasGap.studying_lesson_id });
  check("with the student's own words", lucasGap?.evidence.map((e: any) => e.quote).join("|") === "na república o rei é eleito|o augusto virou presidente", lucasGap?.evidence);
  const lucasSessions = (await live.inject(`/api/students/${lucas}/sessions`)).json() as any[];
  check("the student's page lists the stored conversation with its lesson and analysis", lucasSessions.length === 1 && lucasSessions[0].lesson_id === "L6" && lucasSessions[0].analysis_status === "done", lucasSessions);
  await live.close();
} finally {
  await app.close();
  if (!keep) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

console.log(failures === 0 ? "\nAll end-to-end checks passed." : `\n${failures} end-to-end check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
