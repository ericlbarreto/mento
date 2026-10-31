import { beforeEach, describe, expect, it } from "vitest";
import { RULES_VERSION, type AnalysisRecord, type InsightDraft, type TeacherRepository } from "@mento/contracts";

const zeroMetrics = {
  attempts: 1, correct: 0, partial: 0, incorrect: 1, independent_correct: 0, hints_used: 0,
  sessions: 1, incorrect_sessions: 1, last_attempts: 1, last_incorrect: 1, last_independent_correct: 0, earlier_incorrect: 0,
};

export function insightDraft(overrides: Partial<InsightDraft> = {}): InsightDraft {
  return {
    student_id: "stu-a", session_id: "ses-1", analysis_id: "an-1", kind: "gap", severity: "medium",
    rule: "M1_single_error", rules_version: RULES_VERSION, concept: "Formas de governo", concept_key: "formas de governo",
    title: "t", body: "b", confidence: 0.4, evidence: [{ event_id: "e1", quote: "q" }], diagnosis: null, root_cause: null,
    studying_lesson_id: null, related_gap_id: null, material_ref: null, metrics: zeroMetrics, source: "template", status: "new",
    ...overrides,
  };
}

export function analysisRecord(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    session_id: "ses-1", student_id: "stu-a", status: "done", attempts: 1, input_hash: "h", rules_version: RULES_VERSION,
    writer: "template", prompt_version: "template-v1", skip_reason: null, studying_lesson_id: null, counters: null,
    findings: [], summary: "s", rejections: [], insight_ids: [], error: null, started_at: null, finished_at: null,
    ...overrides,
  };
}


/** Same behaviours for every implementation of TeacherRepository (memory and MongoDB). */
export function repositorySuite(name: string, getRepo: () => TeacherRepository, reset: () => Promise<void>) {
  describe(`TeacherRepository (${name})`, () => {
    let repo: TeacherRepository;
    beforeEach(async () => {
      repo = getRepo();
      await reset();
    });

    it("students: upsert by fixture_id is idempotent; create without fixture inserts", async () => {
      const a1 = await repo.upsertStudent({ fixture_id: "stu_01", name: "Ana", is_simulated: true });
      const a2 = await repo.upsertStudent({ fixture_id: "stu_01", name: "Ana Souza", is_simulated: true });
      await repo.upsertStudent({ name: "Lucas" });
      expect(a2.id).toBe(a1.id);
      expect(a2.name).toBe("Ana Souza");
      const all = await repo.listStudents();
      expect(all.map((s) => s.name)).toEqual(["Ana Souza", "Lucas"]);
      expect((await repo.getStudentByFixtureId("stu_01"))?.id).toBe(a1.id);
      expect((await repo.getStudent(a1.id))?.is_simulated).toBe(true);
      expect(await repo.getStudent("000000000000000000000000")).toBeNull();
      expect(await repo.getStudent("not-an-id")).toBeNull();
      expect(typeof a1.created_at).toBe("string");
    });

    it("class context: singleton set/get", async () => {
      expect(await repo.getClassContext()).toBeNull();
      await repo.setClassContext({ grade_level: "8º ano", description: "a" });
      await repo.setClassContext({ grade_level: "9º ano", description: "b" });
      expect(await repo.getClassContext()).toEqual({ grade_level: "9º ano", description: "b" });
    });

    it("materials: upsert by fixture_id, find by sha256, update", async () => {
      const m1 = await repo.upsertMaterial({ fixture_id: "mat_roma", title: "Roma", subject: "history", is_fixture: true, status: "ready" });
      const m2 = await repo.upsertMaterial({ fixture_id: "mat_roma", title: "Roma 2", subject: "history", is_fixture: true, status: "ready" });
      expect(m2.id).toBe(m1.id);
      expect((await repo.listMaterials()).length).toBe(1);
      const up = await repo.upsertMaterial({ title: "Livro", subject: "history", subject_id: "sub1", file: { key: "k", size: 3, sha256: "abc", mime: "application/pdf" } });
      expect((await repo.findMaterialBySha256("abc"))?.id).toBe(up.id);
      expect(await repo.findMaterialBySha256("zzz")).toBeNull();
      const upd = await repo.updateMaterial(up.id, { status: "processing", progress: { stage: "embedding", done: 1, total: 4 } });
      expect(upd?.status).toBe("processing");
      expect(upd?.progress).toEqual({ stage: "embedding", done: 1, total: 4 });
      expect(upd?.subject_id).toBe("sub1");
      expect(upd?.subject).toBe("history");
      expect(upd?.title).toBe("Livro");
      expect(await repo.updateMaterial("000000000000000000000000", { status: "failed" })).toBeNull();
    });

    it("analyses: saveAnalysis upserts by session_id", async () => {
      const a1 = await repo.saveAnalysis(analysisRecord({ status: "running" }));
      const a2 = await repo.saveAnalysis(analysisRecord({ status: "done", attempts: 2 }));
      expect(a2.id).toBe(a1.id);
      const got = await repo.getAnalysisBySession("ses-1");
      expect(got?.status).toBe("done");
      expect(got?.attempts).toBe(2);
      expect(await repo.getAnalysisBySession("nope")).toBeNull();
    });

    it("insights: create, filter, update, newest first", async () => {
      const i1 = await repo.createInsight(insightDraft({ concept_key: "a", severity: "critical", kind: "gap" }));
      const i2 = await repo.createInsight(insightDraft({ concept_key: "b", severity: "positive", kind: "progress" }));
      await repo.createInsight(insightDraft({ student_id: "stu-b", concept_key: "c" }));
      expect((await repo.listInsights({ student_id: "stu-a" })).length).toBe(2);
      expect((await repo.listInsights({ student_id: "stu-a", severity: "critical" })).map((i) => i.id)).toEqual([i1.id]);
      expect((await repo.listInsights({ kind: "progress" })).map((i) => i.id)).toEqual([i2.id]);
      const updated = await repo.updateInsight(i1.id, { status: "dismissed", title: "novo" });
      expect(updated?.status).toBe("dismissed");
      expect(updated?.title).toBe("novo");
      expect(updated?.concept_key).toBe("a");
      expect((await repo.listInsights({ status: ["new", "accepted"] })).map((i) => i.id)).not.toContain(i1.id);
      expect((await repo.listInsights({ concept_key: "b" }))[0]?.id).toBe(i2.id);
      expect((await repo.getInsight(i2.id))?.evidence).toEqual([{ event_id: "e1", quote: "q" }]);
      expect(await repo.updateInsight("000000000000000000000000", { status: "new" })).toBeNull();
      // the most recently updated insight comes first
      expect((await repo.listInsights({ student_id: "stu-a" }))[0]?.id).toBe(i1.id);
    });

    it("resetTeacherData clears the teacher collections and fixture materials, but keeps real materials", async () => {
      const real = await repo.upsertMaterial({ title: "Livro real", subject: "history", status: "ready" });
      await repo.upsertMaterial({ fixture_id: "mat_x", title: "Fixture", subject: "history", is_fixture: true, status: "ready" });
      await repo.upsertStudent({ name: "x" });
      await repo.setClassContext({ grade_level: "8º ano", description: "" });
      await repo.saveAnalysis(analysisRecord());
      await repo.createInsight(insightDraft());
      await repo.resetTeacherData();
      expect(await repo.listStudents()).toEqual([]);
      expect((await repo.listMaterials()).map((m) => m.id)).toEqual([real.id]);
      expect(await repo.getClassContext()).toBeNull();
      expect(await repo.getAnalysisBySession("ses-1")).toBeNull();
      expect(await repo.listInsights()).toEqual([]);
    });
  });
}
