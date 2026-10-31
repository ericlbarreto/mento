import { describe, expect, it } from "vitest";
import { remapWordTimings, toSpokenText, toSpokenWords } from "./spoken-text";

const say = (t: string) => toSpokenText(t);

describe("toSpokenText", () => {
  it("reads eras after a number, a century or a roman numeral", () => {
    expect(say("Roma foi fundada em 753 a.C., segundo a tradição.")).toBe("Roma foi fundada em 753 antes de Cristo, segundo a tradição.");
    expect(say("A Monarquia caiu em 509 a.C. Pela sua conta, quanto durou?")).toBe("A Monarquia caiu em 509 antes de Cristo. Pela sua conta, quanto durou?");
    expect(say("Já era ocupado por volta de 1000 a.C.")).toBe("Já era ocupado por volta de 1000 antes de Cristo.");
    expect(say("Ele morreu em 14 d.C.; depois veio Tibério.")).toBe("Ele morreu em 14 depois de Cristo; depois veio Tibério.");
    expect(say("Em 44 a. C. Ele foi morto.")).toBe("Em 44 antes de Cristo. Ele foi morto.");
    expect(say("em 146 a.C. Roma destruiu Cartago")).toBe("em 146 antes de Cristo Roma destruiu Cartago");
    expect(say("Quantos anos entre 753 e 509 a.C.?")).toBe("Quantos anos entre 753 e 509 antes de Cristo?");
  });

  it("reads roman centuries: ordinal up to X, cardinal after", () => {
    expect(say("o Palatino por volta do século VIII a.C., com cabanas")).toBe("o Palatino por volta do século oitavo antes de Cristo, com cabanas");
    expect(say("no fim da Monarquia, no século VI a.C., Roma")).toBe("no fim da Monarquia, no século sexto antes de Cristo, Roma");
    expect(say("nos séculos III e II, Roma cresceu")).toBe("nos séculos terceiro e segundo, Roma cresceu");
    expect(say("no séc. XXI temos internet")).toBe("no século vinte e um temos internet");
  });

  it("reads powers and integrals", () => {
    expect(say("Veja: x² tem expoente 2.")).toBe("Veja: x ao quadrado tem expoente 2.");
    expect(say("a integral de x² vira x³ sobre 3, mais C.")).toBe("a integral de x ao quadrado vira x ao cubo sobre 3, mais C.");
    expect(say("quanto dá a integral de x⁴?")).toBe("quanto dá a integral de x elevado à quarta?");
    expect(say("x⁵ sobre 5, mais C.")).toBe("x elevado à quinta sobre 5, mais C.");
    expect(say("e xⁿ vira xⁿ⁺¹?")).toBe("e x elevado a n vira x elevado a n mais 1?");
    expect(say("x⁻¹ é o inverso")).toBe("x elevado a menos 1 é o inverso");
    expect(say("calcule ∫ x² dx agora")).toBe("calcule integral de x ao quadrado d x agora");
  });

  it("leaves lines without targets byte-identical", () => {
    const lines = [
      "Júlio César foi um general e político romano, um dos homens mais poderosos.",
      "E o C no final é a constante de integração, mais C.",
      "Ele tinha 24 anos em 30/10/2026 — um dia bem-humorado, 24/7.",
      "O 1° colocado e a 2ª turma; a e o são letras; I am fine.",
      "Augusto, César, Otávio: Roma  cresceu\n muito.",
      "Já é 753 antes de Cristo e x ao quadrado.",
      "A sala C. e o bloco a. estão longe.",
    ];
    for (const l of lines) expect(say(l)).toBe(l);
  });

  it("is idempotent", () => {
    for (const l of ["753 a.C. Pela", "século VIII a.C.", "x² e x³", "∫ x² dx"]) expect(say(say(l))).toBe(say(l));
  });

  it("is fast", () => {
    const line = "Roma foi fundada em 753 a.C., e a integral de x² vira x³ sobre 3 no século VIII a.C.";
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) say(line);
    expect((performance.now() - t0) / 1000).toBeLessThan(1);
  });
});

describe("remapWordTimings", () => {
  it("gives each written word the span of its spoken words", () => {
    const words = toSpokenWords("Em 753 a.C. Ela");
    const spoken = toSpokenText("Em 753 a.C. Ela").split(" ");
    expect(spoken).toEqual(["Em", "753", "antes", "de", "Cristo.", "Ela"]);
    const timings = spoken.map((w, i) => ({ word: w, start_ms: i * 100, end_ms: i * 100 + 80 }));
    expect(remapWordTimings(words, timings)).toEqual([
      { word: "Em", start_ms: 0, end_ms: 80 },
      { word: "753", start_ms: 100, end_ms: 180 },
      { word: "a.C.", start_ms: 200, end_ms: 480 },
      { word: "Ela", start_ms: 500, end_ms: 580 },
    ]);
  });

  it("returns the raw timings when nothing changed or counts differ", () => {
    const t = [{ word: "Oi", start_ms: 0, end_ms: 10 }];
    expect(remapWordTimings(toSpokenWords("Oi"), t)).toBe(t);
    expect(remapWordTimings(toSpokenWords("753 a.C."), t)).toBe(t);
  });
});
