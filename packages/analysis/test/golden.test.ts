import { describe, expect, it } from "vitest";
import { analyzeAll, labWorld, view } from "./helpers";

describe("golden scenario: the 8 lab conversations, analyzed in chronological order", () => {
  it("BR-17 Ana: Formas de governo is critical (recurring) with root cause in Lição 2; Cidadania medium (Lição 1); Crise positive", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    expect(await view(w, "stu_01")).toEqual([
      { kind: "gap", concept_key: "cidadania na antiguidade", severity: "medium", rule: "M1_single_error", status: "new", diagnosis: "prerequisite", root: "L1" },
      { kind: "gap", concept_key: "formas de governo", severity: "critical", rule: "R3_recurring", status: "new", diagnosis: "prerequisite", root: "L2" },
      { kind: "progress", concept_key: "crise da republica", severity: "positive", rule: "P3_first_success", status: "new", diagnosis: null, root: null },
      { kind: "suggestion", concept_key: "cidadania na antiguidade", severity: "medium", rule: "M1_single_error", status: "new", diagnosis: "prerequisite", root: "L1" },
      { kind: "suggestion", concept_key: "formas de governo", severity: "critical", rule: "R3_recurring", status: "new", diagnosis: "prerequisite", root: "L2" },
    ]);
  });

  it("BR-17 Bruno: the Patrícios e plebeus gap is resolved (P2) with a progress insight; Senado is a first success", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    expect(await view(w, "stu_02")).toEqual([
      { kind: "gap", concept_key: "patricios e plebeus", severity: "medium", rule: "M1_single_error", status: "resolved", diagnosis: "current_topic", root: null },
      { kind: "progress", concept_key: "instituicoes da republica", severity: "positive", rule: "P3_first_success", status: "new", diagnosis: null, root: null },
      { kind: "progress", concept_key: "patricios e plebeus", severity: "positive", rule: "P2_resolved", status: "new", diagnosis: null, root: null },
      { kind: "suggestion", concept_key: "patricios e plebeus", severity: "medium", rule: "M1_single_error", status: "resolved", diagnosis: "current_topic", root: null },
    ]);
  });

  it("BR-17 Carla: Cronologia is medium with root cause in Lição 6; Pão e circo is medium (needs hints) in the current lesson", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    expect(await view(w, "stu_03")).toEqual([
      { kind: "gap", concept_key: "cronologia de roma", severity: "medium", rule: "M1_single_error", status: "new", diagnosis: "prerequisite", root: "L6" },
      { kind: "gap", concept_key: "pao e circo", severity: "medium", rule: "M2_needs_hints", status: "new", diagnosis: "current_topic", root: null },
      { kind: "suggestion", concept_key: "cronologia de roma", severity: "medium", rule: "M1_single_error", status: "new", diagnosis: "prerequisite", root: "L6" },
      { kind: "suggestion", concept_key: "pao e circo", severity: "medium", rule: "M2_needs_hints", status: "new", diagnosis: "current_topic", root: null },
    ]);
  });

  it("BR-17 Diego: Geografia is medium in the current lesson; Guerras Púnicas and Instituições are first successes", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    expect(await view(w, "stu_04")).toEqual([
      { kind: "gap", concept_key: "geografia do mediterraneo", severity: "medium", rule: "M1_single_error", status: "new", diagnosis: "current_topic", root: null },
      { kind: "progress", concept_key: "guerras punicas", severity: "positive", rule: "P3_first_success", status: "new", diagnosis: null, root: null },
      { kind: "progress", concept_key: "instituicoes da republica", severity: "positive", rule: "P3_first_success", status: "new", diagnosis: null, root: null },
      { kind: "suggestion", concept_key: "geografia do mediterraneo", severity: "medium", rule: "M1_single_error", status: "new", diagnosis: "current_topic", root: null },
    ]);
  });

  it("BR-17 Eduarda: a one-message conversation produces no insights", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    expect(await view(w, "stu_05")).toEqual([]);
    const analysis = await w.repo.getAnalysisBySession("ses_eduarda_01");
    expect(analysis?.status).toBe("done");
    expect(analysis?.skip_reason).toBe("short_session");
  });

  it("BR-17 Lucas (the live demo student) has no conversations and no insights", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    expect(await view(w, "stu_06")).toEqual([]);
  });

  it("BR-17 the final summary for Ana connects what she studies now with the likely root cause", async () => {
    const w = await labWorld();
    await analyzeAll(w);
    const a = await w.repo.getAnalysisBySession("ses_ana_02");
    expect(a?.summary).toContain("Está estudando");
    expect(a?.summary).toContain("Crise da República e início do Império");
    expect(a?.summary).toContain("Formas de governo");
    expect(a?.summary).toContain("Lição 2");
  });
});
