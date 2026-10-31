import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { fakeEmbed, makeTestPdf } from "@mento/sources";
import { makeApp, multipart } from "./helpers";

let open: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(open.map((a) => a.close()));
  open = [];
});
async function world(options: Parameters<typeof makeApp>[0] = {}) {
  const w = await makeApp(options);
  open.push(w.app);
  return w;
}

describe("overview metrics (BR-18)", () => {
  it("BR-18 the four metrics and the severity counts match a recount of the insights", async () => {
    const { app } = await world({ analyzeAll: true });
    const overview = (await app.inject("/api/overview")).json();
    expect(overview.students).toEqual({ total: 6, real: 1, simulated: 5 });
    expect(overview.conversations).toBe(8);
    expect(overview.insights).toEqual({ total: 17, gaps_identified: 6, gaps_open: 5, by_severity: { critical: 1, medium: 4, positive: 5 } });

    const all = (await app.inject("/api/insights?status=new,accepted,dismissed,resolved")).json();
    const recount = (sev: string) => [...all.critical, ...all.medium, ...all.positive].filter((i: { severity: string; kind: string; status: string }) => i.severity === sev && i.kind !== "suggestion" && ["new", "accepted"].includes(i.status)).length;
    expect(recount("critical")).toBe(overview.insights.by_severity.critical);
    expect(recount("medium")).toBe(overview.insights.by_severity.medium);
    expect(recount("positive")).toBe(overview.insights.by_severity.positive);
    expect([...all.critical, ...all.medium, ...all.positive]).toHaveLength(overview.insights.total);
  });

  it("BR-18 dismissed insights leave the open counts; simulated students are counted apart", async () => {
    const { app, studentId } = await world({ analyzeAll: true });
    const ana = (await app.inject(`/api/students/${studentId("stu_01")}/insights`)).json();
    const gap = ana.critical.find((i: { kind: string }) => i.kind === "gap");
    expect((await app.inject({ method: "PATCH", url: `/api/insights/${gap.id}`, payload: { status: "dismissed" } })).statusCode).toBe(200);
    const overview = (await app.inject("/api/overview")).json();
    expect(overview.insights.gaps_identified).toBe(5);
    expect(overview.insights.gaps_open).toBe(4);
    expect(overview.insights.by_severity.critical).toBe(0);
    expect(overview.insights.total).toBe(17); // dismissed is still "generated"
    expect(overview.students.simulated).toBe(5);
  });

  it("BR-18 before any conversation is analyzed everything is zero", async () => {
    const { app } = await world();
    const overview = (await app.inject("/api/overview")).json();
    expect(overview.insights).toEqual({ total: 0, gaps_identified: 0, gaps_open: 0, by_severity: { critical: 0, medium: 0, positive: 0 } });
  });
});

describe("student views (BR-19)", () => {
  it("BR-19 the list shows conversations, last activity, open gaps and severity counts per student", async () => {
    const { app } = await world({ analyzeAll: true });
    const rows = (await app.inject("/api/students")).json();
    const ana = rows.find((r: { name: string }) => r.name === "Ana Souza");
    expect(ana).toMatchObject({ is_simulated: true, class_name: "8º A", conversations: 2, open_gaps: 2, insights: { critical: 1, medium: 1, positive: 1 } });
    expect(ana.last_activity).toBe("2026-10-23T13:10:00Z");
    expect(rows.find((r: { name: string }) => r.name === "Lucas Ferreira")).toMatchObject({ is_simulated: false, conversations: 0, last_activity: null, open_gaps: 0 });
    expect(rows.find((r: { name: string }) => r.name === "Bruno Lima")).toMatchObject({ open_gaps: 0, insights: { critical: 0, medium: 0, positive: 2 } });
  });

  it("BR-19 the detail has profile, school history, current term and the latest analysis summary", async () => {
    const { app, studentId } = await world({ analyzeAll: true });
    const detail = (await app.inject(`/api/students/${studentId("stu_01")}`)).json();
    expect(detail.student.profile).toMatchObject({ class_name: "8º A", guardian: { relationship: "mãe" } });
    expect(detail.student.school_history.map((y: { grade_level: string }) => y.grade_level)).toEqual(["6º ano", "7º ano"]);
    expect(detail.student.school_history[0].subjects).toHaveLength(8);
    expect(detail.student.current_term).toHaveLength(8);
    expect(detail.conversations).toBe(2);
    expect(detail.latest_analysis.summary).toContain("Formas de governo");
    expect(detail.latest_analysis.studying_lesson_title).toBe("Crise da República e início do Império");
    expect((await app.inject(`/api/students/${studentId("stu_06")}`)).json().latest_analysis).toBeNull();
  });

  it("BR-19 the insights table is grouped by severity and filters by severity and status", async () => {
    const { app, studentId } = await world({ analyzeAll: true });
    const id = studentId("stu_01");
    const all = (await app.inject(`/api/students/${id}/insights`)).json();
    expect(all.counts).toEqual({ critical: 1, medium: 1, positive: 1 });
    expect(all.critical.map((i: { kind: string }) => i.kind).sort()).toEqual(["gap", "suggestion"]);
    expect(all.medium).toHaveLength(2);
    expect(all.positive).toHaveLength(1);

    const critical = (await app.inject(`/api/students/${id}/insights?severity=critical`)).json();
    expect(critical.critical).toHaveLength(2);
    expect(critical.medium).toEqual([]);
    expect(critical.positive).toEqual([]);

    const resolved = (await app.inject(`/api/students/${studentId("stu_02")}/insights?status=resolved`)).json();
    expect(resolved.medium.map((i: { status: string }) => i.status)).toEqual(["resolved", "resolved"]);
    expect((await app.inject(`/api/students/${id}/insights?status=bogus`)).statusCode).toBe(400);
    expect((await app.inject(`/api/students/${id}/insights?severity=urgent`)).statusCode).toBe(400);
  });

  it("BR-19 evolution marks fewer than 3 attempts as insufficient evidence", async () => {
    const { app, studentId } = await world({ analyzeAll: true });
    const evolution = (await app.inject(`/api/students/${studentId("stu_01")}/evolution`)).json();
    const byKey = Object.fromEntries(evolution.map((e: { concept_key: string }) => [e.concept_key, e]));
    expect(byKey["formas de governo"]).toMatchObject({ n: 3, state: "enough_evidence" });
    expect(byKey["formas de governo"].series).toHaveLength(2);
    expect(byKey["formas de governo"].series[0]).toMatchObject({ session_id: "ses_ana_01", attempts: 2, incorrect: 1, partial: 1 });
    expect(byKey["cidadania na antiguidade"]).toMatchObject({ n: 1, state: "insufficient_evidence" });
    expect((await app.inject(`/api/students/${studentId("stu_06")}/evolution`)).json()).toEqual([]);
  });

  it("BR-19 conversations list per student with the lesson and the number of insights", async () => {
    const { app, studentId } = await world({ analyzeAll: true });
    const sessions = (await app.inject(`/api/students/${studentId("stu_03")}/sessions`)).json();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: "ses_carla_01", lesson_id: "L7", analysis_status: "done", insight_count: 2, topic: "Coliseu" });
    expect(sessions[0].material_title).toContain("Apostila de História");
  });

  it("BR-19 unknown students are 404; POST /students creates a real (non-simulated) student", async () => {
    const { app } = await world();
    expect((await app.inject("/api/students/000000000000000000000000")).statusCode).toBe(404);
    expect((await app.inject("/api/students/not-an-id/insights")).statusCode).toBe(404);
    const created = await app.inject({ method: "POST", url: "/api/students", payload: { name: "  Marina Costa " } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: "Marina Costa", is_simulated: false });
    expect((await app.inject({ method: "POST", url: "/api/students", payload: { name: "" } })).statusCode).toBe(400);
    expect((await app.inject("/api/students")).json()).toHaveLength(7);
  });

  it("BR-19 the class-wide insights section groups critical, medium and positive", async () => {
    const { app } = await world({ analyzeAll: true });
    const section = (await app.inject("/api/insights")).json();
    expect(section.counts).toEqual({ critical: 1, medium: 4, positive: 5 });
    expect(section.critical.every((i: { severity: string }) => i.severity === "critical")).toBe(true);
    const onlyAna = (await app.inject("/api/insights?severity=medium")).json();
    expect(onlyAna.critical).toEqual([]);
  });
});

describe("the teacher's decision (BR-12)", () => {
  it("BR-12 dismissing a gap also dismisses its suggestion; both leave the open lists", async () => {
    const { app, studentId } = await world({ analyzeAll: true });
    const id = studentId("stu_03");
    const before = (await app.inject(`/api/students/${id}/insights`)).json();
    const gap = before.medium.find((i: { kind: string; concept_key: string }) => i.kind === "gap" && i.concept_key === "cronologia de roma");
    const dismissed = await app.inject({ method: "PATCH", url: `/api/insights/${gap.id}`, payload: { status: "dismissed" } });
    expect(dismissed.json()).toMatchObject({ id: gap.id, status: "dismissed" });
    const after = (await app.inject(`/api/students/${id}/insights`)).json();
    expect(after.medium.filter((i: { concept_key: string }) => i.concept_key === "cronologia de roma")).toEqual([]);
    expect(after.counts.medium).toBe(1);
  });

  it("BR-12 accept works, a resolved insight cannot change, unknown ids and bad statuses are rejected", async () => {
    const { app, studentId } = await world({ analyzeAll: true });
    const ana = (await app.inject(`/api/students/${studentId("stu_01")}/insights`)).json();
    const suggestion = ana.critical.find((i: { kind: string }) => i.kind === "suggestion");
    expect((await app.inject({ method: "PATCH", url: `/api/insights/${suggestion.id}`, payload: { status: "accepted" } })).json().status).toBe("accepted");

    const bruno = (await app.inject(`/api/students/${studentId("stu_02")}/insights?status=resolved`)).json();
    expect((await app.inject({ method: "PATCH", url: `/api/insights/${bruno.medium[0].id}`, payload: { status: "dismissed" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "PATCH", url: "/api/insights/000000000000000000000000", payload: { status: "accepted" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: `/api/insights/${suggestion.id}`, payload: { status: "resolved" } })).statusCode).toBe(400);
  });
});

describe("class context (BR-14)", () => {
  it("BR-14 the seeded context is returned and can be updated", async () => {
    const { app } = await world();
    expect((await app.inject("/api/class-context")).json()).toMatchObject({ grade_level: "8º ano" });
    const put = await app.inject({ method: "PUT", url: "/api/class-context", payload: { grade_level: "9º ano", description: "Turma que gosta de debates e tem dificuldade com mapas." } });
    expect(put.statusCode).toBe(200);
    expect((await app.inject("/api/class-context")).json()).toEqual({ grade_level: "9º ano", description: "Turma que gosta de debates e tem dificuldade com mapas." });
  });

  it("BR-14 a description that names a student is rejected (the tutor reads it in every chat)", async () => {
    const { app } = await world();
    for (const description of ["A Ana Souza tem dificuldade com datas.", "Turma boa, mas o Diego se distrai.", "carla mendes lidera a turma"]) {
      const res = await app.inject({ method: "PUT", url: "/api/class-context", payload: { grade_level: "8º ano", description } });
      expect(res.statusCode, description).toBe(422);
    }
    expect((await app.inject({ method: "PUT", url: "/api/class-context", payload: { grade_level: "6º ano", description: "x" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/api/class-context", payload: { grade_level: "8º ano", description: "x".repeat(601) } })).statusCode).toBe(400);
  });
});

describe("analysis lifecycle over HTTP (BR-16)", () => {
  it("BR-16 POST answers 202 pending; after it finishes GET shows done with the summary; unknown sessions are 404", async () => {
    const { app, studentId } = await world();
    expect((await app.inject("/api/sessions/ses_ana_01/analysis")).statusCode).toBe(404);
    const started = await app.inject({ method: "POST", url: "/api/sessions/ses_ana_01/analysis" });
    expect(started.statusCode).toBe(202);
    expect(started.json()).toMatchObject({ session_id: "ses_ana_01", status: "pending" });
    await app.container.analysis.idle();
    const done = (await app.inject("/api/sessions/ses_ana_01/analysis")).json();
    expect(done).toMatchObject({ status: "done", attempts: 1, error: null, rules_version: "rules-v1" });
    expect(done.summary).toBeTruthy();
    expect(done.insight_ids.length).toBeGreaterThan(0);
    expect((await app.inject({ method: "POST", url: "/api/sessions/nope/analysis" })).statusCode).toBe(404);
    expect((await app.inject(`/api/students/${studentId("stu_01")}/insights`)).json().counts).toMatchObject({ medium: 2 });
  });

  it("BR-16 a second POST for a finished session stays done (cached); ?force=true recomputes; the dev route runs synchronously", async () => {
    const { app } = await world();
    await app.inject({ method: "POST", url: "/api/sessions/ses_ana_01/analysis" });
    await app.container.analysis.idle();
    await app.inject({ method: "POST", url: "/api/sessions/ses_ana_01/analysis" });
    await app.container.analysis.idle();
    expect((await app.inject("/api/sessions/ses_ana_01/analysis")).json()).toMatchObject({ status: "done", attempts: 1 });
    await app.inject({ method: "POST", url: "/api/sessions/ses_ana_01/analysis?force=true" });
    await app.container.analysis.idle();
    expect((await app.inject("/api/sessions/ses_ana_01/analysis")).json().attempts).toBe(2);

    const dev = await app.inject({ method: "POST", url: "/api/dev/analyze/ses_ana_02" });
    expect(dev.statusCode).toBe(200);
    expect(dev.json()).toMatchObject({ cached: false, analysis: { status: "done", session_id: "ses_ana_02" } });
    expect((await app.inject({ method: "POST", url: "/api/dev/analyze/nope" })).statusCode).toBe(404);
  });

  it("BR-16 a body-less POST that still sends Content-Type: application/json is accepted; malformed JSON is 400", async () => {
    const { app } = await world();
    const empty = await app.inject({ method: "POST", url: "/api/sessions/ses_ana_01/analysis", headers: { "content-type": "application/json" } });
    expect(empty.statusCode).toBe(202);
    await app.container.analysis.idle();
    const bad = await app.inject({ method: "PATCH", url: "/api/insights/x", headers: { "content-type": "application/json" }, payload: "{not json" });
    expect(bad.statusCode).toBe(400);
    const missing = await app.inject({ method: "PATCH", url: "/api/insights/x", headers: { "content-type": "application/json" } });
    expect(missing.statusCode).toBe(400); // a route that needs a body still validates it
  });

  it("BR-16 the sessionEnded handler analyzes a finished conversation (what Person 3's /end route will call)", async () => {
    const { app, repo } = await world();
    await app.container.sessionEnded.handle("ses_diego_01");
    expect((await repo.getAnalysisBySession("ses_diego_01"))?.status).toBe("done");
  });

  it("BR-16 the live feed delivers analysis_status and insight_created events", async () => {
    const { app } = await world();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as { port: number };
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/stream/teacher`, { signal: controller.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const read = async (until: string) => {
      while (!text.includes(until)) text += decoder.decode((await reader.read()).value ?? new Uint8Array());
    };
    await read("event: hello");
    await app.inject({ method: "POST", url: "/api/sessions/ses_ana_01/analysis" });
    await read("event: insight_created");
    await read('"status":"done"');
    controller.abort();
    expect(text).toContain('"status":"pending"');
    expect(text).toContain('"type":"insight_created"');
  });
});

describe("material upload (BR-21)", () => {
  const goodPdf = () => makeTestPdf(["Capítulo 1 — Roma\nTexto de exemplo com bastante conteúdo para a primeira página do livro.", "Capítulo 2 — A República\nO fim da República aconteceu quando Otávio recebeu o título de Augusto."]);
  const upload = (app: FastifyInstance, fields: Record<string, string>, file?: Parameters<typeof multipart>[1]) =>
    app.inject({ method: "POST", url: "/api/materials", ...multipart(fields, file) });

  it("BR-21 a valid PDF of a subject answers 202 queued, then becomes ready with pages, chapters, passages and sequence", async () => {
    const { app, history, chunkStore } = await world();
    const res = await upload(app, { subject_id: history.id, title: "Livro de Roma" }, { name: "roma.pdf", data: goodPdf() });
    expect(res.statusCode).toBe(202);
    const { id, status, duplicate } = res.json();
    expect(status).toBe("queued");
    expect(duplicate).toBe(false);
    await app.container.ingest.idle();
    const m = (await app.inject(`/api/materials/${id}`)).json();
    expect(m).toMatchObject({ title: "Livro de Roma", subject: "history", subject_id: history.id, status: "ready", pages: 2, progress: { stage: "done" }, error: null });
    expect(m.chapters.map((o: { title: string }) => o.title)).toEqual(["Capítulo 1 — Roma", "Capítulo 2 — A República"]);
    expect(m.sequence).toHaveLength(2);
    expect(m.passages).toBeGreaterThan(0);
    expect(chunkStore.passagesOf(id)).toHaveLength(m.passages);
    expect((await app.inject("/api/materials")).json().map((x: { title: string }) => x.title)).toEqual(expect.arrayContaining(["Livro de Roma"]));
  });

  it("BR-21 the same file twice returns the same material (200, duplicate)", async () => {
    const { app, history } = await world();
    const send = () => upload(app, { subject_id: history.id, title: "Livro" }, { name: "a.pdf", data: goodPdf() });
    const first = await send();
    const second = await send();
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ id: first.json().id, duplicate: true });
    await app.container.ingest.idle();
    expect((await app.inject("/api/materials")).json().filter((m: { title: string }) => m.title === "Livro")).toHaveLength(1);
  });

  it("BR-21 the title defaults to the file name", async () => {
    const { app, history } = await world();
    const { id } = (await upload(app, { subject_id: history.id }, { name: "atlas-mediterraneo.pdf", data: goodPdf() })).json();
    expect((await app.inject(`/api/materials/${id}`)).json().title).toBe("atlas-mediterraneo");
    await app.container.ingest.idle();
  });

  it("BR-21 the subject is required: missing subject_id is 400, an unknown subject is 404 subject_not_found, a non-PDF is 415, no file is 400", async () => {
    const { app, history } = await world();
    const pdf = { name: "a.pdf", data: goodPdf() };
    expect((await upload(app, {}, pdf)).statusCode).toBe(400);
    const unknown = await upload(app, { subject_id: "000000000000000000000000" }, pdf);
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ error: "subject_not_found" });
    expect((await upload(app, { subject_id: "not-an-id" }, pdf)).statusCode).toBe(404);
    expect((await upload(app, { subject_id: history.id }, { name: "x.pdf", data: Buffer.from("MZ not a pdf at all"), type: "application/pdf" })).statusCode).toBe(415);
    expect((await upload(app, { subject_id: history.id })).statusCode).toBe(400);
    expect((await app.inject("/api/materials")).json()).toHaveLength(1); // only the lab material: nothing was stored
  });

  it("BR-21 a file above the size limit is 413 and nothing is stored", async () => {
    const { app, history } = await world({ uploadMaxMb: 0.001 }); // ~1 KB
    const big = makeTestPdf(Array.from({ length: 12 }, (_, i) => `Página ${i + 1}\n${"texto ".repeat(80)}`));
    expect(big.length).toBeGreaterThan(1100);
    expect((await upload(app, { subject_id: history.id }, { name: "grande.pdf", data: big })).statusCode).toBe(413);
    expect((await app.inject("/api/materials")).json()).toHaveLength(1);
  });

  it("BR-21 without embeddings (no VOYAGE_API_KEY) or without the database the upload answers 503 and stores nothing", async () => {
    const noEmbed = await world({ embed: null });
    const res = await upload(noEmbed.app, { subject_id: noEmbed.history.id }, { name: "a.pdf", data: goodPdf() });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: "embeddings_unavailable" });
    expect((await noEmbed.app.inject("/api/materials")).json()).toHaveLength(1);

    const noDb = await world({ dbReady: false });
    const down = await upload(noDb.app, { subject_id: noDb.history.id }, { name: "a.pdf", data: goodPdf() });
    expect(down.statusCode).toBe(503);
    expect(down.json()).toMatchObject({ error: "database_unavailable" });
  });

  it("BR-21 a corrupt PDF is accepted for processing and ends failed with the error, without passages", async () => {
    const { app, history, chunkStore } = await world();
    const { id } = (await upload(app, { subject_id: history.id }, { name: "ruim.pdf", data: Buffer.from("%PDF-1.4 truncated garbage") })).json();
    await app.container.ingest.idle();
    const m = (await app.inject(`/api/materials/${id}`)).json();
    expect(m.status).toBe("failed");
    expect(m.error).toBeTruthy();
    expect(chunkStore.passagesOf(id)).toEqual([]);
  });

  it("BR-21 GET /files/:id serves the PDF with Range support; lab material without a file is 404", async () => {
    const { app, history } = await world();
    const pdf = goodPdf();
    const { id } = (await upload(app, { subject_id: history.id }, { name: "a.pdf", data: pdf })).json();
    await app.container.ingest.idle();
    const full = await app.inject(`/api/files/${id}`);
    expect(full.statusCode).toBe(200);
    expect(full.headers["content-type"]).toContain("application/pdf");
    expect(full.headers["accept-ranges"]).toBe("bytes");
    expect(Buffer.from(full.rawPayload).equals(pdf)).toBe(true);

    const part = await app.inject({ url: `/api/files/${id}`, headers: { range: "bytes=0-9" } });
    expect(part.statusCode).toBe(206);
    expect(part.headers["content-range"]).toBe(`bytes 0-9/${pdf.length}`);
    expect(Buffer.from(part.rawPayload).equals(pdf.subarray(0, 10))).toBe(true);
    const tail = await app.inject({ url: `/api/files/${id}`, headers: { range: "bytes=-5" } });
    expect(Buffer.from(tail.rawPayload).equals(pdf.subarray(pdf.length - 5))).toBe(true);
    expect((await app.inject({ url: `/api/files/${id}`, headers: { range: `bytes=${pdf.length + 10}-` } })).statusCode).toBe(416);

    const lab = (await app.inject("/api/materials")).json().find((m: { is_fixture: boolean }) => m.is_fixture);
    expect((await app.inject(`/api/files/${lab.id}`)).statusCode).toBe(404);
    expect((await app.inject("/api/files/000000000000000000000000")).statusCode).toBe(404);
    expect((await app.inject("/api/materials/000000000000000000000000")).statusCode).toBe(404);
  });
});

describe("the uploaded material reaches the whiteboard (BR-25)", () => {
  const pdf = () =>
    makeTestPdf(["Capítulo 1 — Fundação de Roma\nSegundo a lenda, Roma foi fundada em 753 a.C. por Rômulo e Remo.", "Capítulo 2 — A República\nO fim da República aconteceu quando Otávio recebeu o título de Augusto."]);

  it("BR-25 the material is invisible to the tutor while it is processing and appears in the subject and the catalog when ready", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = fakeEmbed(32);
    const { app, history, chunkStore } = await world({ embed: async (texts, type) => (await gate, slow(texts, type)) });
    const { id } = (await app.inject({ method: "POST", url: "/api/materials", ...multipart({ subject_id: history.id, title: "Roma" }, { name: "roma.pdf", data: pdf() }) })).json();

    // the embeddings are still being made: not in the subject card, not in the catalog the tutor reads
    await vi.waitFor(async () => expect((await app.inject(`/api/materials/${id}`)).json().progress.stage).toBe("embedding"));
    expect((await app.inject(`/api/materials/${id}`)).json().status).toBe("processing");
    expect((await app.inject(`/api/subjects/${history.id}`)).json()).toMatchObject({ material_count: 0, materials: [] });
    expect(await chunkStore.listCatalog(history.id)).toEqual([]);

    release();
    await app.container.ingest.idle();
    expect((await app.inject(`/api/subjects/${history.id}`)).json()).toMatchObject({ key: "history", material_count: 1, materials: [{ id, title: "Roma", pages: 2, status: "ready" }] });
    expect((await app.inject("/api/subjects")).json().subjects[0]).toMatchObject({ material_count: 1 });
    expect(await chunkStore.listCatalog(history.id)).toEqual([{ material_id: id, title: "Roma", subject: "history", subject_id: history.id, chapters: ["Capítulo 1 — Fundação de Roma", "Capítulo 2 — A República"] }]);
  });

  it("BR-25 the tutor's retriever finds the uploaded pages and validates quotes against them", async () => {
    const { app, history } = await world();
    const { id } = (await app.inject({ method: "POST", url: "/api/materials", ...multipart({ subject_id: history.id }, { name: "roma.pdf", data: pdf() }) })).json();
    await app.container.ingest.idle();
    const { retriever } = app.container;
    expect((await retriever.searchChunks({ query: "fim da república", k: 3, material_ids: [id] }))[0]).toMatchObject({ page: 2, material_id: id, subject: "history" });
    expect(await retriever.validateCitation({ material_id: id, page: 2, quote: "O fim da República aconteceu" })).toBe(true);
    expect(await retriever.validateCitation({ material_id: id, page: 1, quote: "O fim da República aconteceu" })).toBe(false);
  });

  it("BR-25 a session started from the subject limits the tutor to the uploaded book", async () => {
    const { app, history } = await world();
    await app.inject({ method: "POST", url: "/api/materials", ...multipart({ subject_id: history.id, title: "Roma" }, { name: "roma.pdf", data: pdf() }) });
    await app.container.ingest.idle();
    const session = await app.inject({ method: "POST", url: "/api/sessions", payload: { student_id: "s1", modality: "text", subject_id: history.id } });
    expect(session.statusCode).toBe(201);
    expect(session.json().subject_id).toBe(history.id);
    // the catalog the tutor puts in its prompt for that subject
    expect((await app.container.repo.getCatalog(history.id)).map((c) => c.title)).toEqual(["Roma"]);
  });
});

describe("fixtures stay out of the tutor's way (BR-26)", () => {
  it("BR-26 the lab material lives in `materials` with is_fixture but is not in any catalog or subject card", async () => {
    const { app, chunkStore, history } = await world();
    const lab = (await app.inject("/api/materials")).json().find((m: { is_fixture: boolean }) => m.is_fixture);
    expect(lab).toMatchObject({ status: "ready", subject: "history", sequence: expect.any(Array) });
    expect(lab.sequence.length).toBe(8);
    expect(await chunkStore.listCatalog()).toEqual([]);
    expect((await app.inject(`/api/subjects/${history.id}`)).json()).toMatchObject({ material_count: 0 });
  });

  it("BR-26 the analysis still reads the fixture's lesson sequence", async () => {
    const { app } = await world();
    const run = await app.container.analysis.run("ses_ana_02");
    expect(run.analysis.status).toBe("done");
    expect(run.insights.some((i) => i.root_cause?.lesson_id === "L2")).toBe(true);
  });
});

describe("API surface", () => {
  it("every teacher route is described in /api/openapi.json", async () => {
    const { app } = await world();
    const paths = Object.keys((await app.inject("/api/openapi.json")).json().paths);
    for (const p of [
      "/api/overview", "/api/students", "/api/students/{id}", "/api/students/{id}/insights", "/api/students/{id}/evolution", "/api/students/{id}/sessions",
      "/api/insights", "/api/insights/{id}", "/api/class-context", "/api/sessions/{id}/analysis", "/api/dev/analyze/{sessionId}",
      "/api/stream/teacher", "/api/materials", "/api/materials/{id}", "/api/files/{id}",
    ]) expect(paths, p).toContain(p);
  });
});
