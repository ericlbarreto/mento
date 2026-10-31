# F — Spoken math audit (TTS normalizer)

Date: 2026-10-31. Follows Plan D and PR #49 (`packages/voice/src/server/tts/spoken-text.ts`).

## How it was tested

1. Pulled the real `speak` texts from the 13 math/physics sessions in the production DB (131 lines, read-only).
2. Ran every line through `toSpokenText` and read the output.
3. Synthesized 30 lines (15 real, 15 likely from the demo books) with ElevenLabs Flash v2.5 (the app voice) and transcribed the audio with Deepgram nova-3 pt-BR as a proxy "ear".
   - Audio: `teste-voz/formulas-2/f01.wav … f30.wav`.
   - Rows: `teste-voz/formulas-2/resultado.json` (written / spoken / heard).

The STT transcript is a proxy. It writes letter names as "X", "F", so "xis" heard as "X" is fine. A garbled transcript ("de decks", "h grau de") is a real misreading.

## What already works (verified)

- `F = m·a` → "éfe igual a eme vezes a"
- `a = 10 / 2 = 5 m/s²` → "a igual a 10 dividido por 2 igual a 5 metros por segundo ao quadrado"
- Equations: `x + y = 10`, `x ≠ 0`, `x ≥ 3`, `a² + b² = c²`, `f(−2)`, `Ep = m·g·h`, `g ≈ 10 m/s²`
- Units after a number inside text: `10 N`, `2 kg`, `60 km/h`
- Ordinals (`2ª lei`, `1º grau`), decimals (`0,4`, `3,5`) and `%`: the TTS reads these correctly by itself.

## Problems found (by priority)

| # | Written | Heard today | Cause | Proposed fix |
|---|---|---|---|---|
| 1 | `150.000.000` | "cento e cinquenta mil e mil" | The TTS misreads the thousands-separator dots | Numbers with `.` thousands groups → words in pt-BR ("cento e cinquenta milhões"), or drop the dots |
| 2 | `100 °C`, `0 °C` | "cem de decks" | `°C` not mapped | `°C` → "graus Celsius", `°` → "graus" (singular for 1) |
| 3 | `−1` on its own | "um" (minus lost) | A Unicode minus before a number outside a math run is not read | `−N` / `-N` before a digit → "menos N" everywhere |
| 4 | `f(x)` with no operator nearby ("integral de f(x)", "quando f(x) é kx") | "h grau de", "fêquiz" | `f(x)` and `kx` are only spoken inside a run that has an operator | Always speak `f(x)` → "éfe de xis". Coefficient+letter (`kx`, `2x`, `ax`) → letter names |
| 5 | `√16`, `π ≈ 3,14` | "dezesseis z", "P vírgula quatorze" | `√`, `π`, and `≈` outside a run not mapped | `√` → "raiz quadrada de", `∛` → "raiz cúbica de", `π` → "pi", `≈` → "aproximadamente" everywhere |
| 6 | `1/2`, `3/4` | "um dois", "três quatro" | `/` between digits kept on purpose (dates) | n/d with d ≤ 10 and no third part → "um meio", "três quartos", "dois terços"; leave `dd/mm/aaaa` as is |
| 7 | `v = Δs / Δt` | "V N D D" | `Δ` not mapped, so the run fails | `Δ` → "delta" (`Δs` → "delta esse", `Δt` → "delta tê") |
| 8 | `(x + 1)(x − 1)` and `(3 + 4) ÷ 2` | "xis vezes um…", "3 mais 4) dividido" | Parens glued to a token break the run: `(x` is not a math word, and the `(` is dropped while the `)` is kept | Split `(`/`)` into their own tokens. `)(` → "vezes". Speak a leading group as "a soma de 3 mais 4, dividida por 2" or just pause: "3 mais 4, dividido por 2" |
| 9 | `3 × 10⁸ m/s` | "eme dividido por esse" | A unit after a number with a power is not seen as a unit | `isUnit` also accepts a preceding number-with-power token |
| 10 | `1 km`, `medida em W`, `kWh` | "um quilômetros", "quiradava" | `km`, `W`, `kWh` only mapped in some positions | Full unit list after numbers (km, cm, mm, m, s, h, min, L, mL, g, J, kJ, cal, kcal, Hz, A, Ω, kWh → "quilowatt-hora"). After "em" / "medida em" too |
| 11 | `CO₂`, `H₂O`, `O₂` (biology book) | "CO dois", "água dois O" | Chemical formulas not mapped | Small map: CO₂ → "cê ó dois", H₂O → "agá dois ó", O₂ → "ó dois", plus a generic rule (letters spelled, subscript digit read) |
| 12 | `"7 × 7"` in quotes | "sete sete" (× lost) | The opening quote glues to the token, so it is not a math word | Strip quotes/brackets before classifying (same as `splitPunct`) |
| 13 | `P = E / t` | "P igual a **i** dividido por T" | `E` read as the conjunction "e" | `E` → "é" in `LETTER_NAMES` (only inside math runs) |
| 14 | `Ec`, `Ep` | "EQ" | Subscript-like variable names | `E` + one lowercase letter in a run → "é cê", "é pê" |
| 15 | `2 xis` (from `2x`) | "dois I I x", "dois e X" | Digit + "xis" sounds glued; needs an ear check | Spell the coefficient: "dois xis". Confirm by ear before changing |

## Recommendation

1. **Fix 1–10 in `spoken-text.ts`**, with a test row per case in `spoken-text.test.ts`. All are deterministic, and each takes a few lines. 1, 2, 3, 4, 5 and 7 are the most likely to appear in the demo (physics and math books).
2. **11–14:** cheap, do them in the same PR if time allows. 11 matters only for the biology book.
3. **15:** listen to `f03.wav` and `f30.wav` first. Change it only if it really sounds wrong.
4. **Prompt (complementary, Person 3's file):** one line in `prompts/base.md` asking for rare symbols (`Δ`, `√`, chemical formulas) to be written in words inside `speak`. The board keeps the symbols. The normalizer stays the safety net.
5. Re-run the harness after the fix (`ear2.mts` in the session scratchpad; it can be moved to `scripts/tts-ear-check.ts` if useful) and compare the "heard" column.

## Applied (fix/p2-tts-math-readings)

Fixes 1–10 and 12 are in `spoken-text.ts`, with a test per case. 15 is also applied, after an ear test: "2 xis" came out garbled in 4 of 4 takes and "dois xis" was clean in 3 of 4, so a one-digit coefficient is spelled. Two findings came out of building it:

- Decimals: the TTS also misreads "1,5" ("um número a cinco") and "3,5" ("três por cinco"). Any decimal is now read as "1 vírgula 5".
- Big numbers: removing the dots is not enough ("203000000" → "dois mil e três mil e vil"), so numbers with thousands groups, and plain integers of 5+ digits, are spelled out. Integers of up to 4 digits (years, "1500 soldados") stay as digits because the TTS reads them well. The spelled form is always masculine ("dois mil e duzentos pessoas"); the TTS said the same with digits.

Guards: "1° lugar" stays an ordinal (only "°C" glued to a number is read as degrees), "24/7" and "15/11" stay, and "by" (English) is not "bê ípsilon". Across 1,669 real `speak` lines from the production DB, the only differences from the old normalizer are the intended ones.

Second ear run (`teste-voz/formulas-3/`): 100 °C, √16, π, 1/2, Δs/Δt, −1, f(x), (x + 1)(x − 1), 3 × 10⁸ m/s, kWh, "1 km" and "7 × 7" are now heard correctly. Still open: 11 (CO₂ is heard as "CO dois"), 13 (`E` in `P = E / t`) and 14 (`Ec`). The TTS also varies from take to take: f01 came out garbled once with exactly the same text that was clean before.
