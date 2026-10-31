import type { WordTiming } from "@mento/contracts";

// Owner: Person 2 (Plan D, prompts/sessions/02-whiteboard-frontend/plans/D-spoken-text-normalizer.md).
// The tutor writes `speak` text for the eyes ("753 a.C.", "x²"); the TTS model (ElevenLabs Flash) reads it
// letter by letter. This turns each written word into what a Brazilian teacher would say, only for the
// patterns seen in real lessons, so a line without them is passed through untouched. Captions keep the
// written words: the word timings of the spoken text are mapped back onto them (remapWordTimings).

export interface SpokenWord {
  written: string;
  spoken: string;
}

const SUP_DIGITS: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
const SUP_RE = /([⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ][⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]*)/;
const POWER_ORDINALS = ["", "", "", "", "quarta", "quinta", "sexta", "sétima", "oitava", "nona", "décima"];

const CENTURY_ORDINALS = ["", "primeiro", "segundo", "terceiro", "quarto", "quinto", "sexto", "sétimo", "oitavo", "nono", "décimo"];
const CARDINALS_11_21 = ["onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove", "vinte", "vinte e um"];

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };

/** Roman numeral I..XXI, or null. */
function romanValue(s: string): number | null {
  if (!/^[IVXL]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]!]!;
    const next = ROMAN[s[i + 1] ?? ""] ?? 0;
    total += v < next ? -v : v;
  }
  return total >= 1 && total <= 21 ? total : null;
}

/** "século oitavo" up to X, "século vinte e um" after (the usual pt-BR norm). */
function centuryWords(n: number): string {
  return n <= 10 ? CENTURY_ORDINALS[n]! : CARDINALS_11_21[n - 11]!;
}

function powerWords(sup: string): string {
  const negative = sup.startsWith("⁻");
  const body = negative ? sup.slice(1) : sup;
  if (/[ⁿ⁺⁻]/.test(body)) {
    // An expression exponent: "ⁿ⁺¹" → "n mais 1".
    const expr = [...body].map((c) => (c === "ⁿ" ? " n " : c === "⁺" ? " mais " : c === "⁻" ? " menos " : (SUP_DIGITS[c] ?? ""))).join("");
    return `elevado a ${negative ? "menos " : ""}${expr.replace(/\s+/g, " ").trim()}`;
  }
  const n = Number([...body].map((c) => SUP_DIGITS[c] ?? "").join(""));
  if (!Number.isFinite(n)) return "";
  if (negative) return `elevado a menos ${n}`;
  if (n === 2) return "ao quadrado";
  if (n === 3) return "ao cubo";
  if (n >= 4 && n <= 10) return `elevado à ${POWER_ORDINALS[n]}`;
  return `elevado a ${n}`;
}

const TRAILING = /([,;:!?)]*)$/;
const isNumber = (w: string) => /^\d[\d.]*$/.test(w.replace(TRAILING, ""));
const isCenturyWord = (w: string) => /^(s[ée]culos?|s[ée]c\.)$/i.test(w);
// A capital after "a.C." is a new sentence only when it is a common sentence opener; "146 a.C. Roma destruiu"
// keeps going (a proper noun), "509 a.C. Pela sua conta" starts a new sentence.
const SENTENCE_OPENERS = new Set(
  "a o as os e é em no na nos nas num numa de do da dos das um uma uns umas pela pelo por para se que qual quais quanto quantos quanta quantas quando como onde porque por que mas então depois antes agora hoje aqui ali isso isto esse essa este esta esses essas aquele aquela ele ela eles elas eu você vocês nós a gente foi era são sim não veja olha repare pense lembre também já só ou nessa nesse naquela naquele assim ainda logo"
    .split(" "),
);
const startsSentence = (w: string | undefined) => !!w && SENTENCE_OPENERS.has(w.replace(/^[("“]+/, "").replace(/[,;:!?.)"”]+$/, "").toLowerCase()) && /^[("“]?[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(w);

/**
 * Split `text` into whitespace-separated written words and give each its spoken form.
 * Words without a target keep spoken === written.
 */
export function toSpokenWords(text: string): SpokenWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: SpokenWord[] = [];
  let centuryChain = false; // inside "séculos III e II"
  let afterIntegral = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const prev = out[out.length - 1];
    const next = words[i + 1];
    let spoken = w;

    // Centuries: "século VIII", "séc. VI", "séculos III e II".
    if (isCenturyWord(w)) {
      if (/^s[ée]c\.$/i.test(w)) spoken = "século";
      centuryChain = true;
      out.push({ written: w, spoken });
      continue;
    }
    if (centuryChain) {
      const [, core = w, tail = ""] = /^(.*?)([,;:!?)]*)$/.exec(w) ?? [];
      const n = romanValue(core);
      if (n !== null) {
        out.push({ written: w, spoken: centuryWords(n) + tail });
        if (tail && tail !== ",") centuryChain = false;
        continue;
      }
      if (w !== "e" && w !== ",") centuryChain = false;
    }

    // Eras: "753 a.C.", "509 a.C. Pela…", "1000 a. C.", "século VI a.C.".
    const eraAnchor = prev && (isNumber(prev.written) || romanValue(prev.written.replace(TRAILING, "")) !== null || isCenturyWord(prev.written));
    if (eraAnchor) {
      const era = /^([aAdD])\.C\.([,;:!?)]*)$/.exec(w);
      if (era) {
        const what = era[1]!.toLowerCase() === "a" ? "antes de Cristo" : "depois de Cristo";
        const tail = era[2]!;
        // The abbreviation's dot may also end the sentence: keep a period at the end or before a sentence opener.
        const end = !tail && (next === undefined || startsSentence(next)) ? "." : "";
        out.push({ written: w, spoken: what + tail + end });
        continue;
      }
      const split = /^([aAdD])\.$/.exec(w);
      const splitNext = next ? /^C\.([,;:!?)]*)$/.exec(next) : null;
      if (split && splitNext) {
        const what = split[1]!.toLowerCase() === "a" ? "antes de" : "depois de";
        const tail = splitNext[1]!;
        const after = words[i + 2];
        const end = !tail && (after === undefined || startsSentence(after)) ? "." : "";
        out.push({ written: w, spoken: what });
        out.push({ written: next!, spoken: "Cristo" + tail + end });
        i += 1;
        continue;
      }
    }

    // Integral: "∫ x² dx", "∫x²dx".
    if (w.startsWith("∫")) {
      afterIntegral = true;
      const rest = w.slice(1);
      out.push({ written: w, spoken: rest ? `integral de ${spokenPowers(rest)}` : "integral de" });
      continue;
    }
    if (afterIntegral && /^dx([,;:!?).]*)$/.test(w)) {
      out.push({ written: w, spoken: w.replace(/^dx/, "dê xis") });
      afterIntegral = false;
      continue;
    }

    // Powers: "x²", "x⁵,", "(x+1)³".
    if (SUP_RE.test(w)) spoken = spokenPowers(w);

    out.push({ written: w, spoken });
  }
  applyMath(out);
  return out;
}

// ---------------------------------------------------------------- math read aloud
// "x + y = 10" is read by the TTS as letters and symbols ("i", silence for "="). Inside a *math run* (a sequence
// of words made only of numbers, single-letter variables, operators and powers that contains an operator) every
// word is spoken: "xis mais ípsilon igual a 10". Outside math runs only the safe cases change: the letters x and
// y on their own (never Portuguese words) and units right after a number ("10 N" → "10 newtons").

const LETTER_NAMES: Record<string, string> = {
  a: "a", b: "bê", c: "cê", d: "dê", e: "e", f: "éfe", g: "gê", h: "agá", i: "i", j: "jota", k: "cá", l: "ele",
  m: "eme", n: "ene", o: "o", p: "pê", q: "quê", r: "erre", s: "esse", t: "tê", u: "u", v: "vê", w: "dáblio",
  x: "xis", y: "ípsilon", z: "zê", π: "pi",
};
const OPERATORS: Record<string, string> = {
  "=": "igual a", "+": "mais", "−": "menos", "-": "menos", "×": "vezes", "·": "vezes", "*": "vezes",
  "/": "dividido por", "÷": "dividido por", "≈": "aproximadamente", "≠": "diferente de", "≤": "menor ou igual a",
  "≥": "maior ou igual a", "<": "menor que", ">": "maior que",
};
// Prefixes read before the atom they belong to: "√16", "Δs".
const PREFIXES: Record<string, string> = { "√": "raiz quadrada de", "∛": "raiz cúbica de", "Δ": "delta" };
const UNITS: Record<string, [string, string]> = {
  "m/s²": ["metro por segundo ao quadrado", "metros por segundo ao quadrado"],
  "m/s": ["metro por segundo", "metros por segundo"],
  "km/h": ["quilômetro por hora", "quilômetros por hora"],
  kWh: ["quilowatt-hora", "quilowatts-hora"],
  kW: ["quilowatt", "quilowatts"],
  W: ["watt", "watts"],
  V: ["volt", "volts"],
  N: ["newton", "newtons"],
  J: ["joule", "joules"],
  kJ: ["quilojoule", "quilojoules"],
  cal: ["caloria", "calorias"],
  kcal: ["quilocaloria", "quilocalorias"],
  Hz: ["hertz", "hertz"],
  kg: ["quilograma", "quilogramas"],
  g: ["grama", "gramas"],
  km: ["quilômetro", "quilômetros"],
  m: ["metro", "metros"],
  cm: ["centímetro", "centímetros"],
  mm: ["milímetro", "milímetros"],
  "m²": ["metro quadrado", "metros quadrados"],
  "cm²": ["centímetro quadrado", "centímetros quadrados"],
  "m³": ["metro cúbico", "metros cúbicos"],
  "cm³": ["centímetro cúbico", "centímetros cúbicos"],
  L: ["litro", "litros"],
  mL: ["mililitro", "mililitros"],
  s: ["segundo", "segundos"],
  min: ["minuto", "minutos"],
  h: ["hora", "horas"],
  "°C": ["grau Celsius", "graus Celsius"],
  "°": ["grau", "graus"],
};
// After "em" ("medida em W") only units that cannot be a Portuguese word or a variable.
const UNITS_AFTER_EM = new Set(["W", "kW", "kWh", "N", "J", "kJ", "Hz", "kcal", "km/h", "m/s", "m/s²", "°C"]);

// ---------------------------------------------------------------- numbers
// The TTS misreads long numbers ("150.000.000" → "cento e cinquenta mil e mil", "203000000" too) and decimals
// ("1,5" → "um número a cinco"), so those are spelled out; short integers ("753", "12") are read well as digits.
const ONES = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
const SCALES: [string, string][] = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"]];
const DENOMINATORS = ["", "", "meio", "terço", "quarto", "quinto", "sexto", "sétimo", "oitavo", "nono", "décimo"];

function below1000(n: number): string {
  if (n === 100) return "cem";
  const parts: string[] = [];
  if (n >= 100) parts.push(HUNDREDS[Math.floor(n / 100)]!);
  const r = n % 100;
  if (r) parts.push(r < 20 ? ONES[r]! : TENS[Math.floor(r / 10)]! + (r % 10 ? ` e ${ONES[r % 10]}` : ""));
  return parts.join(" e ");
}

/** 1500 → "mil e quinhentos", 150000000 → "cento e cinquenta milhões", 1234 → "mil duzentos e trinta e quatro". */
function integerWords(n: number): string {
  if (n === 0) return "zero";
  const groups: [number, number][] = [];
  for (let scale = 0; n > 0 && scale < SCALES.length; scale++, n = Math.floor(n / 1000)) if (n % 1000) groups.unshift([n % 1000, scale]);
  return groups
    .map(([g, scale], k) => {
      const word = scale === 0 ? below1000(g) : scale === 1 && g === 1 ? "mil" : `${below1000(g)} ${SCALES[scale]![g === 1 ? 0 : 1]}`;
      const last = k === groups.length - 1;
      return (k === 0 ? "" : last && (g < 100 || g % 100 === 0) ? " e " : " ") + word;
    })
    .join("");
}

/** Spoken form of a number the TTS misreads, or null when the digits are read well as they are. */
function speakNumber(n: string): string | null {
  const grouped = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/.exec(n);
  if (grouped) return integerWords(Number(grouped[1]!.replace(/\./g, ""))) + (grouped[2] ? ` vírgula ${grouped[2]}` : "");
  if (/^\d{5,12}$/.test(n)) return integerWords(Number(n));
  const decimal = /^(\d+),(\d+)$/.exec(n);
  if (decimal) return `${decimal[1]} vírgula ${decimal[2]}`;
  return null;
}

/** "1/2" → "um meio", "3/4" → "três quartos"; only proper fractions up to tenths ("24/7", "15/11" stay). */
function fractionWords(core: string): string | null {
  const m = /^(\d)\/(\d{1,2})$/.exec(core);
  if (!m) return null;
  const [num, den] = [Number(m[1]), Number(m[2])];
  if (num < 1 || den < 2 || den > 10 || num >= den) return null;
  return `${ONES[num]} ${DENOMINATORS[den]}${num > 1 ? "s" : ""}`;
}

const OP_CHARS = "=+−×·*/÷≈≠≤≥<>";
const NUM = String.raw`[−-]?(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)`;
// One math atom: a number (with an optional variable: 2x, 2π), a function call such as f(x), f(−2), f'(x), a single
// letter or Δ-letter, or a coefficient letter with x ("kx", "ax"; "by" is English); with an optional power and an optional root.
const ATOM = String.raw`[√∛]?(?:${NUM}[a-zA-Zπ]?|[a-zA-Z]'?\([^()\s]{1,6}\)|Δ?[a-zA-Zπ]|(?!e)[a-z]x)[⁻⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺]*`;
const MATH_WORD = new RegExp(String.raw`^(?:${ATOM}|[${OP_CHARS}])(?:[${OP_CHARS}](?:${ATOM}))*$`);
const SPLIT_RE = /^([("“]*)(.*?)([,;:!?.)"”]*)$/;
/** [opening "(" and quotes, core, trailing punctuation]; a ")" that closes a "(" inside the core stays in the core ("f(x)"). */
function splitPunct(word: string): [string, string, string] {
  const [, open = "", core0 = "", tail0 = ""] = SPLIT_RE.exec(word) ?? [];
  let core = core0;
  let tail = tail0;
  while (tail.startsWith(")") && (core.match(/\(/g)?.length ?? 0) > (core.match(/\)/g)?.length ?? 0)) {
    core += ")";
    tail = tail.slice(1);
  }
  return [open, core, tail];
}

const PRODUCT = "⊗"; // stands for ")(" while a core is read: "(x + 1)(x − 1)" → "…1, vezes xis…"
/** Grouping parentheses are silent: drop them, keep function calls ("f(x)"), and turn ")(" into `product`. */
function ungroup(core: string, product: string): string {
  const calls: string[] = [];
  return core
    .replace(/[a-zA-Z]'?\([^()\s]{1,6}\)/g, (call) => `\u0001${calls.push(call) - 1}\u0002`)
    .replace(/\)\(/g, product)
    .replace(/[()]/g, "")
    .replace(/\u0001(\d+)\u0002/g, (_, k: string) => calls[Number(k)]!);
}
const isMathCore = (core: string) => core !== "" && MATH_WORD.test(ungroup(core, "·"));

const isOperatorWord = (core: string) => core.length === 1 && OP_CHARS.includes(core);
// "/" between digits is a date or a ratio ("30/10/2026", "24/7"), never an operator on its own.
const hasInnerOperator = (core: string) => [...core.slice(1)].some((c) => OP_CHARS.includes(c) && c !== "-" && c !== "/");
const NUMBER_CORE = /^[−-]?\d[\d.,]*[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]*$/;

/** Mark math runs and give their words a spoken form; then the safe single-word cases. */
function applyMath(words: SpokenWord[]): void {
  const cores = words.map((w) => splitPunct(w.written)[1]);
  // A unit right after a number ("10 N", "5 m/s²", "10⁸ m/s") is read as a unit, not as letters, so it ends the math run.
  const isUnit = cores.map(
    (c, k) => k > 0 && UNITS[c] !== undefined && (NUMBER_CORE.test(cores[k - 1]!) || (words[k - 1]!.written.toLowerCase() === "em" && UNITS_AFTER_EM.has(c))),
  );
  const isMath = cores.map((c, k) => !isUnit[k] && isMathCore(c));
  let i = 0;
  while (i < words.length) {
    if (!isMath[i]) {
      i++;
      continue;
    }
    let j = i;
    // A run stops after a word ending in sentence punctuation ("= 10." ends the run; "x + y = 10 e" too).
    while (j < words.length && isMath[j] && (j === i || !/[.;:!?]$/.test(words[j - 1]!.written))) j++;
    const run = cores.slice(i, j);
    const hasOperator = run.some((c, k) => (isOperatorWord(c) && k > 0 && k < run.length - 1) || hasInnerOperator(ungroup(c, "·")));
    if (hasOperator) for (let k = i; k < j; k++) words[k]!.spoken = speakMathWord(words[k]!.written);
    i = j;
  }
  for (let k = 0; k < words.length; k++) {
    const w = words[k]!;
    const [open, core, tail] = splitPunct(w.written);
    // "10 N", "2 kg", "5 m/s²", "200 kWh", "medida em W" (wins over the power rule for "m/s²").
    if (isUnit[k]) {
      const unit = UNITS[core]!;
      w.spoken = open + (splitPunct(words[k - 1]!.written)[1] === "1" ? unit[0] : unit[1]) + tail;
      continue;
    }
    if (w.spoken !== w.written) continue;
    const spoken = speakLoneWord(core);
    if (spoken !== null) w.spoken = open + spoken + tail;
  }
}

/** Single words outside a math run that are safe to read: numbers, fractions, degrees, f(x), roots, x and y. */
function speakLoneWord(core: string): string | null {
  // "quanto vale y", "quando x é 2": x and y are never Portuguese words.
  if (core === "y" || core === "x") return LETTER_NAMES[core]!;
  if (core === "≈") return OPERATORS[core]!;
  const degrees = /^(\d+(?:,\d+)?)°(C)$/.exec(core); // "100°C" ("1°" alone is an ordinal: "1° lugar")
  if (degrees) return `${speakNumber(degrees[1]!) ?? degrees[1]} ${degrees[1] === "1" ? "grau" : "graus"}${degrees[2] ? " Celsius" : ""}`;
  const negative = /^[−-](\d[\d.,]*)$/.exec(core); // "o expoente é −1"
  if (negative) return `menos ${speakNumber(negative[1]!) ?? negative[1]}`;
  const number = fractionWords(core) ?? speakNumber(core);
  if (number) return number;
  // "a integral de f(x)", "quando f(x) é kx", "√16", "Δs", "2π".
  if (/^(?:[fgh]'?\([^()\s]{1,6}\)|(?!e)[a-z]x|[√∛Δ].+|\d+π)$/.test(core) && isMathCore(core)) return speakMathWord(core);
  return null;
}

/** "x" → "xis", "2x" → "dois xis", "f(−2)" → "éfe de menos 2", "m·a" → "eme vezes a", "y²" → "ípsilon ao quadrado". */
function speakMathWord(written: string): string {
  const [open, core, tail0] = splitPunct(written);
  const lead = open.replace(/\(/g, ""); // keep quotes, drop grouping parens
  // A closing group paren is a short pause: "(3 + 4) ÷ 2" → "3 mais 4, dividido por 2".
  const tail = tail0.includes(")") ? tail0.replace(/\)/g, "") || "," : tail0;
  const fraction = fractionWords(core);
  if (fraction) return lead + fraction + tail;
  const parts: string[] = [];
  let rest = ungroup(core, PRODUCT);
  while (rest.length) {
    const head = rest[0]!;
    const op = OPERATORS[head] ?? PREFIXES[head] ?? (head === PRODUCT ? ", vezes" : undefined);
    if (op) {
      parts.push(op);
      rest = rest.slice(1);
      continue;
    }
    const m = new RegExp(String.raw`^(?:(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)([a-zA-Zπ])?|([a-zA-Z])'?\(([^()\s]{1,6})\)|([a-zA-Zπ]))([⁻⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺]*)`).exec(rest);
    if (!m) return written; // something unexpected: leave the word as written
    const [all, num, coefVar, fn, arg, letter, sup] = m;
    if (num) {
      // A one-digit coefficient is spelled: "2 xis" comes out garbled, "dois xis" does not (plan F ear test).
      const n = coefVar && /^\d$/.test(num) ? ONES[Number(num)]! : (speakNumber(num) ?? num);
      parts.push(coefVar ? `${n} ${LETTER_NAMES[coefVar.toLowerCase()] ?? coefVar}` : n);
    } else if (fn) parts.push(`${LETTER_NAMES[fn.toLowerCase()] ?? fn}${all!.includes("'") ? " linha" : ""} de ${speakMathWord(arg!)}`);
    else if (letter) parts.push(LETTER_NAMES[letter.toLowerCase()] ?? letter);
    if (sup) parts.push(powerWords(sup));
    rest = rest.slice(all!.length);
  }
  return lead + parts.join(" ").replace(/\s+/g, " ").replace(/\s+,/g, ",").replace(/^,\s*/, "").trim() + tail;
}

/** "x²" → "x ao quadrado", "x⁵," → "x elevado à quinta,". Only the first power of a word is read. */
function spokenPowers(w: string): string {
  const m = SUP_RE.exec(w);
  if (!m) return w;
  const raw = w.slice(0, m.index);
  // A single-letter base is said by its name: "x²" → "xis ao quadrado".
  const before = /^\(?[a-zA-Z]$/.test(raw) ? raw.replace(/[a-zA-Z]$/, (c) => LETTER_NAMES[c.toLowerCase()] ?? c) : raw;
  const after = w.slice(m.index + m[1]!.length);
  const words = powerWords(m[1]!);
  if (!words) return w;
  return `${before} ${words}${after}`.trim();
}

/** The text to synthesise: the input itself when nothing changed (byte-identical), else the spoken words. */
export function toSpokenText(text: string, words: SpokenWord[] = toSpokenWords(text)): string {
  return words.some((w) => w.spoken !== w.written) ? words.map((w) => w.spoken).join(" ") : text;
}

/**
 * Word timings come from the spoken text; give each written word the span of its spoken words, so the
 * caption (which shows the written text) is highlighted in step with the voice. Raw timings are returned
 * when the counts do not line up (the provider split words differently).
 */
export function remapWordTimings(words: SpokenWord[], timings: WordTiming[]): WordTiming[] {
  if (!words.some((w) => w.spoken !== w.written)) return timings;
  const counts = words.map((w) => w.spoken.split(/\s+/).filter(Boolean).length);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total !== timings.length) return timings;
  const out: WordTiming[] = [];
  let k = 0;
  words.forEach((w, i) => {
    const n = counts[i]!;
    const first = timings[k]!;
    const last = timings[k + n - 1]!;
    out.push({ word: w.written, start_ms: first.start_ms, end_ms: last.end_ms });
    k += n;
  });
  return out;
}
