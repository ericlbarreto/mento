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
      out.push({ written: w, spoken: w.replace(/^dx/, "d x") });
      afterIntegral = false;
      continue;
    }

    // Powers: "x²", "x⁵,", "(x+1)³".
    if (SUP_RE.test(w)) spoken = spokenPowers(w);

    out.push({ written: w, spoken });
  }
  return out;
}

/** "x²" → "x ao quadrado", "x⁵," → "x elevado à quinta,". Only the first power of a word is read. */
function spokenPowers(w: string): string {
  const m = SUP_RE.exec(w);
  if (!m) return w;
  const before = w.slice(0, m.index);
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
