import { describe, expect, it } from "vitest";
import { RULES_VERSION, WriterOutput, type ConversationSource, type Insight, type SessionBundle, type TeacherEvent, type TeacherRepository } from "@mento/contracts";
import {
  AnalysisService,
  InMemoryConversationSource,
  SessionEndedHandler,
  analysisInputHash,
  getLearnerSummary,
  getOverview,
  getStudentInsights,
  LlmWriter,
  buildAnalysisInput,
  type AnalysisWriter,
} from "../src";
import { analyzeAll, fakeClock, input, labWorld, makeBundle, sess, ev, view } from "./helpers";

const strip = (i: Insight) => ({ ...i, id: "", analysis_id: "", student_id: "", related_gap_id: i.related_gap_id ? "gap" : null, created_at: "", updated_at: "" });

describe("determinism (BR-09)", () => {
  it("BR-09 the same input twice gives the same hash; a different rules version or writer changes it", async () => {
    const inp = input([sess("s1", [ev("A", "incorrect")])]);
    const h = analysisInputHash(inp, { id: "template", version: "template-v1" });
    expect(analysisInputHash(structuredClone(inp), { id: "template", version: "template-v1" })).toBe(h);
    expect(analysisInputHash(inp, { id: "template", version: "template-v1" }, "rules-v2")).not.toBe(h);
    expect(analysisInputHash(inp, { id: "llm:x", version: "p1" })).not.toBe(h);
    expect(analysisInputHash(input([sess("s1", [ev("A", "correct")])]), { id: "template", version: "template-v1" })).not.toBe(h);
  });

  it("BR-09 re-running an unchanged session returns the stored analysis (cached) and writes nothing new", async () => {
    const w = await labWorld();
    const first = await w.service.run("ses_ana_01");
    const insightsBefore = await w.repo.listInsights();
    const second = await w.service.run("ses_ana_01");
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.analysis.id).toBe(first.analysis.id);
    expect(second.analysis.input_hash).toBe(first.analysis.input_hash);
    expect(await w.repo.listInsights()).toEqual(insightsBefore);
  });

  it("BR-09 two independent runs produce byte-identical insights (ids and timestamps aside)", async () => {
    const runs = [];
    for (let i = 0; i < 2; i++) {
      const w = await labWorld();
      await analyzeAll(w);
      const all = (await w.repo.listInsights()).map(strip).sort((a, b) => (a.session_id + a.kind + a.concept_key < b.session_id + b.kind + b.concept_key ? -1 : 1));
      runs.push(JSON.stringify(all));
    }
    expect(runs[0]).toBe(runs[1]);
  });

  it("BR-09 the LLM is called once; the second run is cached; force=true calls it again", async () => {
    let calls = 0;
    const writer: AnalysisWriter = {
      id: "llm:fake", prompt_version: "p1",
      async write(): Promise<WriterOutput> {
        calls += 1;
        return { summary: "Resumo", insights: [] };
      },
    };
    const w = await labWorld({ writer });
    await w.service.run("ses_ana_01");
    await w.service.run("ses_ana_01");
    expect(calls).toBe(1);
    const forced = await w.service.run("ses_ana_01", { force: true });
    expect(forced.cached).toBe(false);
    expect(calls).toBe(2);
    expect((await w.repo.getAnalysisBySession("ses_ana_01"))?.attempts).toBe(2);
  });

  it("BR-09 an LLM failure falls back to the template and is recorded, the analysis still finishes", async () => {
    const writer: AnalysisWriter = { id: "llm:fake", prompt_version: "p1", write: async () => { throw new Error("provider down"); } };
    const w = await labWorld({ writer });
    const r = await w.service.run("ses_ana_01");
    expect(r.analysis.status).toBe("done");
    expect(r.analysis.rejections).toContainEqual({ concept_key: "*", reason: "llm_failed" });
    expect(r.insights.every((i) => i.source === "template")).toBe(true);
  });

  it("BR-09 a valid recorded LLM response is applied and stored with source=llm", async () => {
    const w0 = await labWorld();
    const bundle = (await w0.conversations.getSessionBundle("ses_diego_02"))!;
    const recorded: WriterOutput = {
      summary: "Está estudando a expansão romana e entende bem o conteúdo, mas tem dificuldade com o mapa do Mediterrâneo.",
      insights: [
        {
          concept_key: "geografia do mediterraneo", rule: "M1_single_error", severity: "medium", diagnosis: "outside_material",
          title: "Dificuldade para localizar regiões no mapa", body: "Precisou de dicas de localização para citar regiões conquistadas.",
          reasoning: "A Lição 5 pressupõe leitura de mapa, que nenhuma lição da unidade ensina.",
          evidence: [{ event_id: bundle.events.find((e) => e.type === "verification_answered" && e.payload.answer.includes("itália"))?.id ?? "x", quote: "a itália e... não lembro" }],
          suggestion: { title: "Atividade 5.1 com mapa atual", body: "Comparar o mapa antigo com um mapa atual.", material_ref: { lesson_id: "L5", pages: [42, 47] } },
        },
      ],
    };
    const writer = new LlmWriter({ id: "llm:recorded", prompt_version: "p1", systemPrompt: "s", complete: async () => JSON.stringify(recorded) });
    const w = await labWorld({ writer });
    await w.service.run("ses_diego_01");
    const r = await w.service.run("ses_diego_02");
    const geo = r.insights.find((i) => i.kind === "gap" && i.concept_key === "geografia do mediterraneo")!;
    expect(r.analysis.summary).toContain("mapa do Mediterrâneo");
    expect(geo).toMatchObject({ source: "llm", diagnosis: "outside_material", title: "Dificuldade para localizar regiões no mapa" });
    expect(geo.severity).toBe("medium");
    expect(geo.confidence).toBeLessThanOrEqual(0.5);
  });
});

describe("insights are upserted, never duplicated (BR-10)", () => {
  it("BR-10 a resumed session reuses its analysis until new learning evidence arrives", async () => {
    const w = await labWorld();
    let bundle = structuredClone((await w.conversations.getSessionBundle("ses_ana_01"))!);
    const conversations: ConversationSource = {
      async listAllSessions() { return [bundle.session]; },
      async listSessionsByStudent(studentId) { return bundle.session.student_id === studentId ? [bundle.session] : []; },
      async getSessionBundle(sessionId) { return sessionId === bundle.session.id ? structuredClone(bundle) : null; },
    };
    const service = new AnalysisService({ repo: w.repo, conversations, now: fakeClock("2026-11-02T00:00:00.000Z") });
    const appendEvent = (event: Omit<SessionBundle["events"][number], "id" | "session_id" | "seq" | "ts">) => {
      const seq = bundle.events.length + 1;
      const stored = {
        ...event,
        id: `${bundle.session.id}_resumed_${seq}`,
        session_id: bundle.session.id,
        seq,
        ts: new Date(Date.parse(bundle.session.started_at) + seq * 60_000).toISOString(),
      } as SessionBundle["events"][number];
      bundle.events.push(stored);
      return stored;
    };

    const first = await service.run(bundle.session.id);
    const firstInsights = await w.repo.listInsights({ student_id: bundle.session.student_id });
    const previousEndedAt = bundle.session.ended_at!;
    appendEvent({ type: "session_resumed", payload: { previous_ended_at: previousEndedAt } });
    appendEvent({ type: "session_ended", payload: { reason: "manual" } });

    const lifecycleOnly = await service.run(bundle.session.id);
    expect(lifecycleOnly.cached).toBe(true);
    expect(lifecycleOnly.analysis.id).toBe(first.analysis.id);
    expect(lifecycleOnly.analysis.attempts).toBe(1);
    expect(await w.repo.listInsights({ student_id: bundle.session.student_id })).toEqual(firstInsights);

    appendEvent({ type: "session_resumed", payload: { previous_ended_at: previousEndedAt } });
    const verificationId = "ver_resumed";
    appendEvent({
      type: "verification_asked",
      payload: { verification_id: verificationId, element_id: "el_resumed", concept: "Formas de governo", concept_key: "formas de governo", lesson_id: "L6", question: "Qual era a diferença?", kind: "open" },
    });
    const answer = appendEvent({ type: "verification_answered", payload: { verification_id: verificationId, element_id: "el_resumed", answer: "Ainda não sei." } });
    const evidenceId = "evd_resumed";
    bundle.evidence.push({
      id: evidenceId,
      session_id: bundle.session.id,
      student_id: bundle.session.student_id,
      concept: "Formas de governo",
      concept_key: "formas de governo",
      lesson_id: "L6",
      result: "incorrect",
      independent: true,
      hints_used: 0,
      rationale: "The resumed answer is still incorrect.",
      ts: answer.ts,
    });
    appendEvent({
      type: "evidence_recorded",
      payload: { evidence_id: evidenceId, verification_id: verificationId, concept: "Formas de governo", concept_key: "formas de governo", result: "incorrect", independent: true, hints_used: 0, rationale: "The resumed answer is still incorrect." },
    });
    appendEvent({ type: "session_ended", payload: { reason: "manual" } });

    const second = await service.run(bundle.session.id);
    expect(second.cached).toBe(false);
    expect(second.analysis.id).toBe(first.analysis.id);
    expect(second.analysis.attempts).toBe(2);
    const open = await w.repo.listInsights({ student_id: bundle.session.student_id, concept_key: "formas de governo", status: ["new", "accepted"] });
    expect(open.filter((insight) => insight.kind === "gap")).toHaveLength(1);
    expect(open.filter((insight) => insight.kind === "suggestion")).toHaveLength(1);
    for (const insight of open) {
      expect(new Set(insight.evidence.map((item) => item.event_id)).size).toBe(insight.evidence.length);
      expect(insight.evidence.some((item) => item.event_id === answer.id)).toBe(true);
    }
  });

  it("BR-10 the same concept in two sessions is one gap whose severity rises and whose evidence grows", async () => {
    const w = await labWorld();
    await w.service.run("ses_ana_01");
    const before = (await w.repo.listInsights({ student_id: w.studentId("stu_01"), kind: "gap", concept_key: "formas de governo" }))[0]!;
    expect(before.severity).toBe("medium");
    await w.service.run("ses_ana_02");
    const gaps = await w.repo.listInsights({ student_id: w.studentId("stu_01"), kind: "gap", concept_key: "formas de governo" });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.id).toBe(before.id);
    expect(gaps[0]!.severity).toBe("critical");
    expect(gaps[0]!.evidence.length).toBeGreaterThan(before.evidence.length);
    expect(new Set(gaps[0]!.evidence.map((e) => e.event_id)).size).toBe(gaps[0]!.evidence.length);
    expect(gaps[0]!.updated_at > before.updated_at).toBe(true);
  });

  it("BR-10 a different concept creates its own gap", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    const gaps = await w.repo.listInsights({ student_id: w.studentId("stu_01"), kind: "gap" });
    expect(gaps.map((g) => g.concept_key).sort()).toEqual(["cidadania na antiguidade", "formas de governo"]);
  });

  it("BR-10 re-running an older session does not overwrite what a newer session wrote", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    await w.service.run("ses_ana_01", { force: true });
    const gap = (await w.repo.listInsights({ student_id: w.studentId("stu_01"), kind: "gap", concept_key: "formas de governo" }))[0]!;
    expect(gap.severity).toBe("critical");
    expect(gap.rule).toBe("R3_recurring");
  });
});

describe("resolution (BR-11)", () => {
  it("BR-11 P2 resolves the gap and its suggestion and adds a progress insight; resolved gaps leave the open counts", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    const bruno = await w.repo.listInsights({ student_id: w.studentId("stu_02") });
    expect(bruno.filter((i) => i.kind === "gap").map((i) => i.status)).toEqual(["resolved"]);
    expect(bruno.filter((i) => i.kind === "suggestion").map((i) => i.status)).toEqual(["resolved"]);
    expect(bruno.filter((i) => i.kind === "progress" && i.rule === "P2_resolved")).toHaveLength(1);
    const table = await getStudentInsights(w.repo, w.studentId("stu_02"));
    expect(table.counts).toEqual({ critical: 0, medium: 0, positive: 2 });
    const summary = await getLearnerSummary(w.repo, w.studentId("stu_02"));
    expect(summary.open_gaps).toEqual([]);
  });

  it("BR-11 a resolved concept that fails again opens a new gap", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    const bruno = w.studentId("stu_02");
    const conv = new InMemoryConversationSource([
      ...(await Promise.all((await w.conversations.listSessionsByStudent(bruno)).map((s) => w.conversations.getSessionBundle(s.id)))).map((b) => b!),
      makeBundle({ id: "ses_b3", student_id: bruno, material_id: w.material.id, lesson_id: "L4", started_at: "2026-11-02T10:00:00Z", verifications: [{ concept: "Patrícios e plebeus", lesson: "L4", result: "incorrect", answer: "plebeus eram nobres" }] }),
    ]);
    const service = new AnalysisService({ repo: w.repo, conversations: conv, now: fakeClock("2026-11-03T00:00:00Z") });
    await service.run("ses_b3");
    const gaps = await w.repo.listInsights({ student_id: bruno, kind: "gap", concept_key: "patricios e plebeus" });
    expect(gaps.map((g) => g.status).sort()).toEqual(["new", "resolved"]);
  });
});

describe("the teacher's decision is final (BR-12)", () => {
  it("BR-12 a dismissed gap is never reopened or edited, and leaves the counts and the learner summary", async () => {
    const w = await labWorld();
    const ana = w.studentId("stu_01");
    await w.service.run("ses_ana_01");
    const gap = (await w.repo.listInsights({ student_id: ana, kind: "gap", concept_key: "formas de governo" }))[0]!;
    await w.repo.updateInsight(gap.id, { status: "dismissed" });
    await w.service.run("ses_ana_02");
    const after = await w.repo.listInsights({ student_id: ana, kind: "gap", concept_key: "formas de governo" });
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: gap.id, status: "dismissed", severity: "medium", rule: "M1_single_error" });
    const overview = await getOverview(w.repo, w.conversations);
    expect(overview.insights.gaps_identified).toBe(1); // only Cidadania remains
    expect(overview.insights.by_severity.critical).toBe(0);
    expect((await getLearnerSummary(w.repo, ana)).open_gaps.map((g) => g.concept_key)).toEqual(["cidadania na antiguidade"]);
  });

  it("BR-12 a dismissed insight does not come back in the student table unless asked for", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    const ana = w.studentId("stu_01");
    const [critical] = (await getStudentInsights(w.repo, ana)).critical.filter((i) => i.kind === "gap");
    await w.repo.updateInsight(critical!.id, { status: "dismissed" });
    expect((await getStudentInsights(w.repo, ana)).critical.map((i) => i.id)).not.toContain(critical!.id);
    expect((await getStudentInsights(w.repo, ana, { status: ["dismissed"] })).critical.map((i) => i.id)).toContain(critical!.id);
  });
});

describe("one suggestion per open gap (BR-13)", () => {
  it("BR-13 re-analysis (even forced) never creates a second suggestion", async () => {
    const w = await labWorld();
    await w.service.run("ses_ana_01");
    await w.service.run("ses_ana_01", { force: true });
    await w.service.run("ses_ana_02");
    await w.service.run("ses_ana_02", { force: true });
    const suggestions = await w.repo.listInsights({ student_id: w.studentId("stu_01"), kind: "suggestion", concept_key: "formas de governo" });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.severity).toBe("critical");
  });

  it("BR-13 an accepted suggestion keeps its status and is still the only one; a dismissed one is not recreated", async () => {
    const w = await labWorld();
    await w.service.run("ses_ana_01");
    const ana = w.studentId("stu_01");
    const sugg = async () => w.repo.listInsights({ student_id: ana, kind: "suggestion", concept_key: "formas de governo" });
    await w.repo.updateInsight((await sugg())[0]!.id, { status: "accepted" });
    await w.service.run("ses_ana_02");
    expect(await sugg()).toHaveLength(1);
    expect((await sugg())[0]!.status).toBe("accepted");
    await w.repo.updateInsight((await sugg())[0]!.id, { status: "dismissed" });
    await w.service.run("ses_ana_02", { force: true });
    expect(await sugg()).toHaveLength(1);
    expect((await sugg())[0]!.status).toBe("dismissed");
  });
});

describe("privacy (BR-14)", () => {
  it("BR-14 the analysis input carries no name, profile or school history", async () => {
    const w = await labWorld();
    const trigger = (await w.conversations.getSessionBundle("ses_ana_02"))!;
    const inp = buildAnalysisInput({ trigger, history: [trigger], material: w.material, class_context: null });
    const json = JSON.stringify(inp);
    for (const forbidden of ["Ana Souza", "Márcia", "guardian", "enrollment", "school_history", "birth_date", "example.com"]) {
      expect(json, forbidden).not.toContain(forbidden);
    }
    expect(Object.keys(inp).sort()).toEqual(["class_context", "material", "rules_version", "sessions", "skip_reason", "student_id", "studying_lesson_id", "trigger_session_id"]);
  });

  it("BR-14 getLearnerSummary returns concepts and descriptions only", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    const summary = await getLearnerSummary(w.repo, w.studentId("stu_01"));
    expect(Object.keys(summary).sort()).toEqual(["open_gaps", "recent_progress"]);
    expect(summary.open_gaps[0]).toMatchObject({ concept_key: "formas de governo" }); // most severe first
    const json = JSON.stringify(summary);
    for (const forbidden of ["Ana Souza", "Márcia", "enrollment", "school_history", "guardian"]) expect(json).not.toContain(forbidden);
    expect(summary.open_gaps.length).toBeLessThanOrEqual(5);
    expect(summary.recent_progress.length).toBeLessThanOrEqual(3);
  });
});

describe("analysis lifecycle (BR-16)", () => {
  it("BR-16 start() goes pending → running → done and the row is readable while it runs", async () => {
    const w = await labWorld();
    const row = await w.service.start("ses_ana_01");
    expect(row.status).toBe("pending");
    expect((await w.repo.getAnalysisBySession("ses_ana_01"))?.status).toMatch(/pending|running|done/);
    await w.service.idle();
    const statuses = w.events.flatMap((e: TeacherEvent) => (e.type === "analysis_status" && e.session_id === "ses_ana_01" ? [e.status] : []));
    expect(statuses).toEqual(["pending", "running", "done"]);
    expect((await w.repo.getAnalysisBySession("ses_ana_01"))?.status).toBe("done");
    expect(w.events.filter((e) => e.type === "insight_created").length).toBeGreaterThan(0);
  });

  it("BR-16 start() for a session already finished returns the stored analysis and stays done", async () => {
    const w = await labWorld();
    await w.service.run("ses_ana_01");
    const row = await w.service.start("ses_ana_01");
    await w.service.idle();
    expect(row.status).toBe("done");
    expect((await w.repo.getAnalysisBySession("ses_ana_01"))?.status).toBe("done");
  });

  it("BR-16 concurrent requests for one session never interleave: a normal and a forced start give exactly 2 attempts", async () => {
    const w = await labWorld();
    await w.service.run("ses_ana_01");
    await Promise.all([w.service.start("ses_ana_01"), w.service.start("ses_ana_01", { force: true })]);
    await w.service.idle();
    expect(await w.repo.getAnalysisBySession("ses_ana_01")).toMatchObject({ status: "done", attempts: 2 });
  });

  it("BR-16 two concurrent runs on a fresh session compute once; the other is served from the stored result", async () => {
    const w = await labWorld();
    const [a, b] = await Promise.all([w.service.run("ses_diego_01"), w.service.run("ses_diego_01")]);
    expect([a.cached, b.cached].sort()).toEqual([false, true]);
    expect((await w.repo.getAnalysisBySession("ses_diego_01"))?.attempts).toBe(1);
    expect(await w.repo.listInsights({ student_id: w.studentId("stu_04"), kind: "gap" })).toHaveLength(1);
  });

  it("BR-16 an unknown session is an error and writes nothing", async () => {
    const w = await labWorld();
    await expect(w.service.run("nope")).rejects.toThrow(/not found/);
    await expect(w.service.start("nope")).rejects.toThrow(/not found/);
    expect(await w.repo.getAnalysisBySession("nope")).toBeNull();
  });

  it("BR-16 a failure is stored as failed with the error; the handler retries once after the delay and succeeds", async () => {
    const w = await labWorld();
    let failuresLeft = 1;
    const flaky: TeacherRepository = new Proxy(w.repo, {
      get(target, prop, receiver) {
        if (prop === "createInsight") {
          return async (...args: Parameters<TeacherRepository["createInsight"]>) => {
            if (failuresLeft-- > 0) throw new Error("database hiccup");
            return target.createInsight(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const service = new AnalysisService({ repo: flaky, conversations: w.conversations, now: fakeClock("2026-11-01T00:00:00Z") });
    const scheduled: { fn: () => void; ms: number }[] = [];
    const handler = new SessionEndedHandler(service, { retryDelayMs: 30_000, schedule: (fn, ms) => scheduled.push({ fn, ms }) });

    await handler.handle("ses_ana_01");
    const failed = await w.repo.getAnalysisBySession("ses_ana_01");
    expect(failed).toMatchObject({ status: "failed", error: "database hiccup", attempts: 1 });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.ms).toBe(30_000);

    scheduled[0]!.fn();
    await new Promise((r) => setTimeout(r, 20));
    const done = await w.repo.getAnalysisBySession("ses_ana_01");
    expect(done).toMatchObject({ status: "done", attempts: 2, error: null });
    expect((await w.repo.listInsights({ student_id: w.studentId("stu_01") })).length).toBeGreaterThan(0);
  });

  it("BR-16 the handler does not retry when the first attempt succeeds, and retries only once", async () => {
    const w = await labWorld();
    const scheduled: (() => void)[] = [];
    const ok = new SessionEndedHandler(w.service, { schedule: (fn) => scheduled.push(fn) });
    await ok.handle("ses_ana_01");
    expect(scheduled).toHaveLength(0);

    const broken = new AnalysisService({ repo: w.repo, conversations: { ...w.conversations, getSessionBundle: async () => { throw new Error("source down"); }, listAllSessions: async () => [], listSessionsByStudent: async () => [] } });
    const h = new SessionEndedHandler(broken, { schedule: (fn) => scheduled.push(fn) });
    await h.handle("ses_ana_01");
    expect(scheduled).toHaveLength(1);
    scheduled[0]!();
    await new Promise((r) => setTimeout(r, 20));
    expect(scheduled).toHaveLength(1); // the retry failing does not schedule another retry
  });

  it("BR-16 rules_version is stored with every analysis and insight", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    expect((await w.repo.getAnalysisBySession("ses_ana_02"))?.rules_version).toBe(RULES_VERSION);
    expect((await w.repo.listInsights()).every((i) => i.rules_version === RULES_VERSION)).toBe(true);
    expect(await view(w, "stu_05")).toEqual([]);
  });
});
