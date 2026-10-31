import { describe, expect, it } from "vitest";
import { classifyBargeIn } from "./barge-in";

describe("classifyBargeIn", () => {
  const tutorText = "Em 27 a.C., o Senado deu a Otávio o título de Augusto.";

  it("waits for two words in an interim transcript", () => {
    expect(classifyBargeIn({ transcript: "Espera", kind: "interim", tutorText })).toMatchObject({ decision: "wait" });
  });

  it("ignores a partial transcript that matches the tutor audio", () => {
    expect(classifyBargeIn({ transcript: "o Senado deu a Otávio", kind: "interim", tutorText })).toMatchObject({
      decision: "echo",
      overlap: 1,
    });
  });

  it("confirms a different two-word interim transcript as barge-in", () => {
    expect(classifyBargeIn({ transcript: "Espera aí", kind: "interim", tutorText })).toMatchObject({ decision: "interrupt" });
  });

  it("confirms a different single-word final transcript", () => {
    expect(classifyBargeIn({ transcript: "Pare", kind: "final", tutorText })).toMatchObject({ decision: "interrupt" });
  });

  it("ignores a final transcript copied from the tutor", () => {
    expect(classifyBargeIn({ transcript: "Augusto", kind: "final", tutorText })).toMatchObject({ decision: "echo" });
  });

  it("does not hide a real disagreement just because one word overlaps", () => {
    expect(classifyBargeIn({ transcript: "Não entendi", kind: "interim", tutorText: "Não foi durante a República." })).toMatchObject({ decision: "interrupt" });
  });
});
