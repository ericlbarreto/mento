import { describe, expect, it } from "vitest";
import type { Event } from "@mento/contracts";
import { buildSystem, buildUserMessage, historyFromEvents, type CatalogEntry } from "./prompt-builder";

const prompts = { base: "BASE", subjects: { history: "HISTORY PROFILE", generic: "GENERIC PROFILE" } };
const catalog: CatalogEntry[] = [{ material_id: "m1", title: "História de Roma", subject: "history", chapters: ["A República", "O Império"] }];
const summary = {
  open_gaps: [{ concept: "Fim da República", concept_key: "fim da republica", description: "Confunde República e Império", confidence: 0.6 }],
  recent_progress: [],
};

describe("buildSystem", () => {
  const blocks = buildSystem({ prompts, classContext: { grade_level: "8º ano", description: "Turma participativa" }, summary, catalog });

  it("puts everything stable in two blocks and a single cache breakpoint at the end", () => {
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.cache_control).toBeUndefined();
    expect(blocks[1]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("includes the base prompt, every subject profile, the class context, the open gaps and the catalog", () => {
    const first = blocks[0]!.text;
    expect(first).toContain("BASE");
    expect(first).toContain("HISTORY PROFILE");
    expect(first).toContain("GENERIC PROFILE");
    expect(first).toContain("8º ano");
    expect(first).toContain("Turma participativa");
    expect(first).toContain("Fim da República (fim da republica)");
    expect(blocks[1]!.text).toContain("m1 | História de Roma | history | A República; O Império");
  });

  it("says so when there are no gaps and no materials", () => {
    const empty = buildSystem({ prompts, classContext: { grade_level: "7º ano", description: "" }, summary: { open_gaps: [], recent_progress: [] }, catalog: [] });
    expect(empty[0]!.text).toContain("No open gaps recorded yet.");
    expect(empty[1]!.text).toContain("(no materials uploaded yet)");
  });
});

describe("buildUserMessage", () => {
  const base = { modality: "voice" as const, history: [], boardSnapshot: "(the board is empty)", passages: [] };

  it("describes the opening turn when there is no input", () => {
    const text = buildUserMessage({ ...base, appended: [] });
    expect(text).toContain("The conversation is starting");
    expect(text).toContain("(none retrieved)");
  });

  it("includes the student message, the selection, the passages, the transcript and the board", () => {
    const text = buildUserMessage({
      modality: "text",
      history: [{ role: "student", text: "Oi" }, { role: "tutor", text: "Olá!" }],
      boardSnapshot: "tl | timeline | main | 27 a.C. Otávio vira Augusto",
      passages: [{ id: "c1", material_id: "m1", subject: "history", chapter: "O Império", page: 12, passage_idx: 0, text: "Em 27 a.C., o Senado..." }],
      appended: [{ name: "user_message", kind: "board_select", text: "O que é isso?", selected: { element_id: "tl", text: "27 a.C." } }],
    });
    expect(text).toContain("Aluno: Oi");
    expect(text).toContain("Tutor: Olá!");
    expect(text).toContain("tl | timeline | main | 27 a.C.");
    expect(text).toContain("[m1 · p.12 · O Império]\nEm 27 a.C., o Senado...");
    expect(text).toContain('The student said (text): "O que é isso?"');
    expect(text).toContain('The student selected on the board: tl ("27 a.C.")');
    expect(text).not.toContain("The conversation is starting");
  });

  it("reports an answer to a verification and an interruption", () => {
    const text = buildUserMessage({
      ...base,
      appended: [{ name: "verification_answer", verification_id: "ver_1", element_id: "q_augusto", answer: "Mudou o governo" }],
      interrupted: { turn_id: "turn_2", action_id: "act_2_3", spoken_chars: 40, spoken_ms: 2100 },
    });
    expect(text).toContain('The student answered the question q_augusto (ver_1): "Mudou o governo"');
    expect(text).toContain("The student interrupted you after about 40 characters of your last reply");
  });
});

describe("historyFromEvents", () => {
  const ev = (type: Event["type"], payload: unknown, n: number): Event => ({ id: String(n), session_id: "s", ts: "2026-10-30T21:00:00.000Z", type, payload });

  it("builds the transcript from student messages, answers and tutor speech, newest last, limited", () => {
    const events = [
      ev("session_started", {}, 1),
      ev("tutor_action", { name: "speak", args: { text: "Olá!" } }, 2),
      ev("tutor_action", { name: "write_text", args: { html: "<h1>x</h1>" } }, 3),
      ev("user_message", { text: "Oi" }, 4),
      ev("verification_answered", { answer: "Foi em 27 a.C." }, 5),
    ];
    expect(historyFromEvents(events)).toEqual([
      { role: "tutor", text: "Olá!" },
      { role: "student", text: "Oi" },
      { role: "student", text: "Foi em 27 a.C." },
    ]);
    expect(historyFromEvents(events, 2)).toHaveLength(2);
  });
});
