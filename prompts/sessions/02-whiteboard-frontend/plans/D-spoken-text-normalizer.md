# Plan D — The tutor's voice says "antes de Cristo" and "x ao quadrado"

## FINAL (merged after independent reviews: Lua = product scope on 601 real lines, speech engineer = design)
Both agree on a server-side normaliser in `TtsService` and on cutting most of the draft's rules. Merged design (overrides the draft below):

**Scope (only what real lines need; every other rule can only make a correct reading worse):**
- Eras: `a.C.` / `d.C.` (also split `a. C.`) only after a number, a roman century or "século(s)"; keeps a sentence-ending period before a capital ("509 a.C. Pela…" → "antes de Cristo. Pela…").
- Centuries: "século(s)" / "séc." + roman 1–21 (also lists "séculos III e II") → ordinal up to X ("século oitavo"), cardinal after ("século vinte e um").
- Powers: superscripts ⁰–⁹ and ⁿ (and ⁻) → "x ao quadrado", "x ao cubo", "x elevado à quarta … à décima", "elevado a n".
- Integral: "∫" → "integral de"; "dx" only right after an integral → "d x".
- Cut from the draft: operators (`=`, `+`, `-`, `x`, `*`), fractions, units, `°`, `f(x)`, roman numerals outside "século", bare "aC" — none appear in the data and all risk false positives. Next slice adds caret `x^2`, √, `=`/`+` inside a detected math run, only when a real line needs it.

**Design:**
- `toSpokenSegments(text)` returns written words, each with its spoken form. Spoken text = the join; text with no target is passed through byte-identical.
- `TtsService.start` synthesises the spoken text, caches by spoken-text key (rule changes bust old entries), and **maps the word timings back onto the written words** (first spoken word start → last spoken word end), so `speech_alignment` matches the caption 1:1 and the caption highlight / `spoken_chars` do not drift. On a count mismatch, it falls back to the raw timings.
- No `previous_text`/`next_text` work (never sent). No prompt change (words in `speak` make captions long; the normaliser is the guarantee). No model switch (multilingual adds latency, doesn't fix math). Provider `apply_text_normalization` not relied on.
- Captions, chat and history keep the written text.

**Acceptance:** real a.C./superscript/∫/century lines produce the expected spoken form; every other production line (~550) unchanged (checked locally, production text is NOT committed — student names, minors); idempotent; < 1 ms/line; listen test via `POST /api/dev/tts-start` on 8 lines (753 a.C.; 509 a.C. + capital; 1000 a.C.; século VIII a.C.; x² / x³ / x⁵ sobre 5; ∫ x² dx; 753 menos 509 = 244), founder confirms by ear; bare numbers that fail are logged for the next slice.

---

## Draft (pre-review)

> Status: draft for review (2026-10-31). Cross-lane: `packages/voice` (server TTS), `prompts/base.md` (tutor), Person 2 for captions. Founder authorized editing every lane.

## 1. Problem
The founder: when the tutor says "753 a.C." the voice does not say "antes de Cristo"; in math, "x²" / "x³" are not read as "x ao quadrado" / "x ao cubo". It sounds wrong.

## 2. Evidence (production, read-only, 2026-10-31)
- 597 stored `speak` lines in the latest 60 sessions; **51 (8.5 %)** contain era abbreviations, superscripts, roman-numeral centuries or math symbols.
- Real examples:
  - "Roma fundada em 753 a.C., e a Monarquia cair em 509 a.C."
  - "por volta do século VIII a.C." / "no século VI a.C."
  - "a integral de x² vira x³ sobre 3, mais C." / "quanto dá a integral de x⁴?"
- TTS: ElevenLabs `eleven_flash_v2_5` (default, `apps/api/src/config.ts`), `language_code: "pt"`, WebSocket `stream-input` with `auto_mode` (`packages/voice/src/server/tts/elevenlabs-ws.ts`) and an HTTP fallback (`elevenlabs-http.ts`). The `speak.text` goes unchanged from `turn-engine.ts:317` → `TtsService.start` → provider. Flash models do little text normalisation, so they read "a.C." letter by letter ("a cê") and drop or mangle superscripts.
- Captions do not depend on matching spoken words: `CaptionBar` advances by time ratio (`captionProgress`) over the caption's own words, so changing the spoken text does not break word highlighting.

## 3. Options
| Option | How | Pros | Cons |
|---|---|---|---|
| D1 Prompt only | Tell the tutor to write `speak` text "as said" ("753 antes de Cristo", "x ao quadrado") | Zero code | Not guaranteed (LLM drifts); captions then show long spelled-out text; board/caption consistency suffers |
| D2 ElevenLabs normalisation | Request param `apply_text_normalization: "on"` (HTTP) / pronunciation dictionaries | Provider-side | Docs: normalisation is not supported or slower on Flash/Turbo models; dictionaries are per-voice aliases, poor for patterns like `x^n`; not testable offline |
| **D3 Server-side spoken-text normaliser (recommended)** | A pure function `toSpokenPtBr(text)` applied in `TtsService.start` (and to `previous_text`/`next_text`) before the provider and the cache key | Deterministic, unit-tested, works for every provider/model, zero latency (µs), captions keep the written form ("753 a.C.") while the voice says "antes de Cristo" | Must avoid false positives (dates, hyphens, slashes in normal prose) |
| D4 Switch to a multilingual model with normalisation | `eleven_multilingual_v2` | Better reading of numbers | Higher latency (≈ +200–400 ms first byte); still not reliable for math |

**Recommendation: D3, plus a one-line prompt hint (D1-lite) to keep math in `speak` simple.**

## 4. Normaliser rules (pt-BR, `packages/voice/src/server/tts/spoken-text.ts`)
Order matters; each rule has unit tests with real lines from §2.
1. **Eras:** `a.C.`, `a. C.`, `aC` (only after a number or "século …") → "antes de Cristo"; `d.C.` → "depois de Cristo". Keep the following punctuation (a trailing "." of the abbreviation is not a sentence end unless followed by space+capital or end).
2. **Centuries:** "século VIII" / "séc. VIII" → "século oito" (roman → arabic → pt-BR words via a small number speller 1–30); also "séculos III e II".
3. **Powers:** superscripts `²` → " ao quadrado", `³` → " ao cubo", `⁴…⁹`, `ⁿ` → " elevado à quarta / à quinta … / à n"; caret `x^2`, `x^{3}`, `2^n` same; negative `x⁻¹` → "x elevado a menos um".
4. **Roots and calculus:** `√x` → "raiz quadrada de x", `∛` → "raiz cúbica de", `∫` → "integral de", `dx` after an integral → "d x", `f(x)` → "f de x", `f'(x)` → "f linha de x".
5. **Operators (math context only — a token run that contains a digit, a single-letter variable next to an operator, or a superscript):** `=` "igual a", `≠` "diferente de", `≤` "menor ou igual a", `≥` "maior ou igual a", `≈` "aproximadamente", `×`/`·`/`*` "vezes", `÷` "dividido por", `+` "mais", `−`/` - ` "menos" (spaced or leading before a digit; never inside hyphenated words), `π` "pi", `∞` "infinito", `%` "por cento", `°` "graus".
6. **Fractions:** `1/2` "um meio", `1/3` "um terço", `3/4` "três quartos" (denominators 2–10, numerators 1–9); other `a/b` in math context → "a sobre b"; never touch dates `dd/mm(/yyyy)` or URLs.
7. **Units (after a number):** `km/h` "quilômetros por hora", `m/s` "metros por segundo", `m/s²` "metros por segundo ao quadrado", `kg` "quilos", `cm`, `km`, `°C` "graus Celsius".
8. **Leave everything else untouched** (names, "D. Pedro II" → out of scope, ordinals like "1º" are read fine).

## 5. Where it runs
- `TtsService.start(req)`: `const spoken = toSpokenPtBr(req.text)`; use `spoken` for the provider and the cache key; `previous_text`/`next_text` normalised too. The `speak.text` sent to the client (caption, chat, history) stays as written.
- Also export it for the dev route `POST /api/dev/tts-start` (same service, nothing extra).
- Alignment (`speech_alignment` words) comes from the spoken text; the client only uses its timing, so no change on the front.

## 6. Prompt (tutor)
Add to the voice rule: "In `speak`, prefer words for math ('x ao quadrado', 'a integral de x elevado a quatro') when you say it aloud; symbols and formulas go on the board." This reduces symbol soup; the normaliser remains the guarantee.

## 7. Validation
- Unit tests: every rule, the 51 real lines (snapshot of input → output), and a false-positive corpus (normal History/Science prose without symbols must come out identical; hyphenated words, "24/7", dates "30/10/2026", "Cap. 3", "D. Pedro").
- Listen test: `POST /api/dev/tts-start` with 10 lines (dates, centuries, powers, integral, fraction) and play the PCM; founder confirms by ear.
- Latency: normaliser < 1 ms per line (benchmark in test).

## 8. Out of scope / later
Reading full equations naturally ("2x + 3 = 7" → "dois x mais três igual a sete" works with rules 5; complex LaTeX does not); other languages; SSML.

## 9. Estimate
2–3 h including tests and the listen check.
