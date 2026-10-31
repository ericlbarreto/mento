import { describe, expect, it } from "vitest";
import { gapStage } from "./status";
import type { Gap } from "./types";

const gap = (over: Partial<Gap>): Gap => ({
  id: "g", student_id: "s", session_id: "x", concept: "Formas de governo", title: "t", description: "d", severity: "medium",
  evidence: [], attempts: 2, confidence: 0.6, material_ref: null, status: "open", created_at: "2026-10-31T00:00:00Z", ...over,
});

describe("gapStage", () => {
  it("a single wrong answer is only watched", () => {
    expect(gapStage(gap({ rule: "M1_single_error", attempts: 1 })).label).toBe("Em observação");
  });
  it("a repeated mistake is a gap, and one that keeps coming back is persistent", () => {
    expect(gapStage(gap({ rule: "R1_repeated_errors", severity: "critical", incorrect_sessions: 1 }))).toMatchObject({ label: "Lacuna", tone: "danger" });
    expect(gapStage(gap({ rule: "R3_recurring", incorrect_sessions: 2 })).note).toBe("Apareceu em 2 conversas.");
    expect(gapStage(gap({ rule: "R3_recurring", incorrect_sessions: 3 })).label).toBe("Persistente");
  });
});

describe("conversationTitle and conversationResult", async () => {
  const { conversationResult, conversationTitle } = await import("./status");
  const base = { id: "s", student_id: "x", topic: null, material_title: "História de Roma Antiga Volume I", lesson_title: "História de Roma Antiga Volume I", started_at: "2026-10-31T00:00:00Z", summary: null };
  it("names a conversation by the concepts the tutor checked, else the lesson, else a free conversation", () => {
    expect(conversationTitle({ ...base, concepts: ["Formas de governo", "Cidadania"] })).toEqual({ title: "Formas de governo e Cidadania", detail: "História de Roma Antiga Volume I" });
    expect(conversationTitle({ ...base, concepts: ["A", "B", "C"] }).title).toBe("A, B e mais 1");
    expect(conversationTitle({ ...base, lesson_title: "Capítulo 3 — O Império", concepts: [] }).title).toBe("Capítulo 3 — O Império");
    expect(conversationTitle({ ...base, concepts: [] })).toEqual({ title: "Conversa livre", detail: "Sem perguntas de verificação · História de Roma Antiga Volume I" });
  });
  it("says what came out of it", () => {
    expect(conversationResult({ ...base, ended_at: null }).label).toBe("Não encerrada");
    expect(conversationResult({ ...base, ended_at: "x", analysis_status: null }).label).toBe("Sem análise");
    expect(conversationResult({ ...base, ended_at: "x", analysis_status: "done", insight_count: 2 }).label).toBe("2 achados");
    expect(conversationResult({ ...base, ended_at: "x", analysis_status: "done", insight_count: 0 }).label).toBe("Nada a apontar");
  });
});
