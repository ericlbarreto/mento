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
    expect(say("Veja: x² tem expoente 2.")).toBe("Veja: xis ao quadrado tem expoente 2.");
    expect(say("a integral de x² vira x³ sobre 3, mais C.")).toBe("a integral de xis ao quadrado vira xis ao cubo sobre 3, mais C.");
    expect(say("quanto dá a integral de x⁴?")).toBe("quanto dá a integral de xis elevado à quarta?");
    expect(say("x⁵ sobre 5, mais C.")).toBe("xis elevado à quinta sobre 5, mais C.");
    expect(say("e xⁿ vira xⁿ⁺¹?")).toBe("e xis elevado a n vira xis elevado a n mais 1?");
    expect(say("x⁻¹ é o inverso")).toBe("xis elevado a menos 1 é o inverso");
    expect(say("calcule ∫ x² dx agora")).toBe("calcule integral de xis ao quadrado dê xis agora");
  });

  it("reads equations and formulas inside math runs", () => {
    expect(say("no sistema x + y = 10 e x − y = 4, as retas se cruzam no ponto (7, 3).")).toBe(
      "no sistema xis mais ípsilon igual a 10 e xis menos ípsilon igual a 4, as retas se cruzam no ponto (7, 3).",
    );
    expect(say("uma incógnita, como em 5 + 2x = 23.")).toBe("uma incógnita, como em 5 mais dois xis igual a 23.");
    expect(say("a aceleração: F = m·a. Vou desenhar")).toBe("a aceleração: éfe igual a eme vezes a. Vou desenhar");
    expect(say("o peso é uma força, P = m × g, medida em newtons")).toBe("o peso é uma força, pê igual a eme vezes gê, medida em newtons");
    expect(say("Vou desenhar o gráfico de f(x) = x² para você.")).toBe("Vou desenhar o gráfico de éfe de xis igual a xis ao quadrado para você.");
    expect(say("Por exemplo, f(0) = 0, então")).toBe("Por exemplo, éfe de 0 igual a 0, então");
    expect(say("para y = 2x de 0 a 2")).toBe("para ípsilon igual a dois xis de 0 a 2");
    expect(say("Com F = 10 N e m = 2 kg, a = 10 / 2 = 5 m/s².")).toBe(
      "Com éfe igual a 10 newtons e eme igual a 2 quilogramas, a igual a 10 dividido por 2 igual a 5 metros por segundo ao quadrado.",
    );
    expect(say("O gráfico confirma: 7 + 3 dá 10 e 7 − 3 dá 4.")).toBe("O gráfico confirma: 7 mais 3 dá 10 e 7 menos 3 dá 4.");
  });

  it("reads x, y and units after numbers outside equations", () => {
    expect(say("quanto vale y quando x é 2?")).toBe("quanto vale ípsilon quando xis é 2?");
    expect(say("o par (x, y) e o eixo x.")).toBe("o par (xis, ípsilon) e o eixo xis.");
    expect(say("um bloco de 1 kg e uma força de 10 N")).toBe("um bloco de 1 quilograma e uma força de 10 newtons");
    expect(say("um chuveiro de 5500 W gasta 41,25 kWh.")).toBe("um chuveiro de 5500 watts gasta 41 vírgula 25 quilowatts-hora.");
  });

  it("reads the cases the TTS got wrong in the ear test (plan F)", () => {
    expect(say("Assim 150.000.000 vira 1,5 × 10⁸.")).toBe("Assim cento e cinquenta milhões vira 1 vírgula 5 vezes 10 elevado à oitava.");
    expect(say("eram 2.200 pessoas e 1.000.000 de votos")).toBe("eram dois mil e duzentos pessoas e um milhão de votos");
    expect(say("A água ferve a 100 °C e a 37°C.")).toBe("A água ferve a 100 graus Celsius e a 37 graus Celsius.");
    expect(say("o expoente é −1, e fica 5 × 10⁻¹.")).toBe("o expoente é menos 1, e fica 5 vezes 10 elevado a menos 1.");
    expect(say("a área é a integral de f(x) de a até b")).toBe("a área é a integral de éfe de xis de a até b");
    expect(say("quando f(x) é kx, o valor")).toBe("quando éfe de xis é cá xis, o valor");
    expect(say("A raiz é √16 = 4, e π ≈ 3,14.")).toBe("A raiz é raiz quadrada de 16 igual a 4, e pi aproximadamente 3 vírgula 14.");
    expect(say("Metade é 1/2, e 3/4 da pizza.")).toBe("Metade é um meio, e três quartos da pizza.");
    expect(say("A velocidade média é v = Δs / Δt.")).toBe("A velocidade média é vê igual a delta esse dividido por delta tê.");
    expect(say("O produto notável é (x + 1)(x − 1) = x² − 1.")).toBe("O produto notável é xis mais 1, vezes xis menos 1, igual a xis ao quadrado menos 1.");
    expect(say("a mediana: (3 + 4) ÷ 2 = 3,5 horas.")).toBe("a mediana: 3 mais 4, dividido por 2 igual a 3 vírgula 5 horas.");
    expect(say("A luz viaja a 3 × 10⁸ m/s.")).toBe("A luz viaja a 3 vezes 10 elevado à oitava metros por segundo.");
    expect(say("Um carro percorre 1 km, medida em W, e o consumo em kWh.")).toBe(
      "Um carro percorre 1 quilômetro, medida em watts, e o consumo em quilowatts-hora.",
    );
    expect(say("uma sala de 20 m² e 2 L de água em 5 s")).toBe("uma sala de 20 metros quadrados e 2 litros de água em 5 segundos");
    expect(say('Esse "7 × 7" é a área.')).toBe('Esse "7 vezes 7" é a área.');
  });

  it("leaves words and dates that only look like math", () => {
    for (const l of [
      "Ele tinha 24 anos em 30/10/2026 — um dia bem-humorado, 24/7.",
      "A e B são letras; a e o também; o N do norte.",
      "Um time de 3 a 2 e um placar de 10 - 0 é goleada?",
      "Página 12, capítulo 3: e-mail, guarda-chuva, pré-história.",
      "Ele ficou em 1° lugar no 2° ano, de 9 a 15/11, by the way.",
      "Em 1500 os portugueses chegaram; em 1822 veio a independência.",
    ])
      expect(say(l)).toBe(l);
  });

  it("leaves lines without targets byte-identical", () => {
    const lines = [
      "Júlio César foi um general e político romano, um dos homens mais poderosos.",
      "E o C no final é a constante de integração, mais C.",
      "Ele tinha 24 anos em 30/10/2026 — um dia bem-humorado, 24/7.",
      "O 1° colocado e a 2ª turma; a e o são letras; I am fine.",
      "Augusto, César, Otávio: Roma  cresceu\n muito.",
      "Já é 753 antes de Cristo e xis ao quadrado.",
      "A sala C. e o bloco a. estão longe.",
    ];
    for (const l of lines) expect(say(l)).toBe(l);
  });

  it("is idempotent", () => {
    for (const l of ["753 a.C. Pela", "século VIII a.C.", "x² e x³", "∫ x² dx", "150.000.000 e 1,5", "(x + 1)(x − 1) = 0", "100 °C", "√16 e Δs"]) expect(say(say(l))).toBe(say(l));
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
