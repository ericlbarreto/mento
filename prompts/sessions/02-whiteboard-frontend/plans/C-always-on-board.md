# Plan C — Every tutor reply writes or draws on the board

> **Partly superseded by D80 (2026-10-31):** the tutor no longer writes on the board in every reply, and the engine's held speak and `board_fallback_*` card are removed. The board gets text only when the reply continues the lesson on it; side questions get a voice-only answer, and the student can ask to put something on the board. See `docs/10-decisions.md` (D80).

## FINAL (merged after independent reviews: Minerva = acceptance with re-measured data, LLM-agent engineer = mechanism)
Both reviewers reject the draft's "extra round after the question": the client plays actions in order behind each `speak`, so anything added after the question lands after the student's turn begins, and a round ending on `write_text` re-triggers the continuation and asks a **second question**. Merged design:

**Evidence (re-measured, production, read-only):** 187 spoken turns, 38 without any board action (20 %). **13 of 38 were interrupted by the student** (silence = 36 % of interrupted vs 17 % of completed turns) — partly barge-in, not model failure. Categories: off-topic/redirect 12, meta/social 12, short teaching 11, clarification 2, apology 1. Some say "no quadro está…" without touching it. After the 2026-10-31 02:11 prompt change only 5 turns exist → re-measure before and after.

**1. Prompt (`prompts/base.md`)**
- Rule 1 + "**Your second action is always a board action**, also in short, social or meta replies."
- Rule 8: replace "at least one `draw` in this reply" with "at least one board action in every reply; a `draw` whenever something new appears (two when the topic is new)" — removes the conflict for short replies.
- Valid board actions: `write_text`, `write_timeline`, `draw`, `update_element`, and `circle_annotate`/`highlight` **on the element being discussed** (pointing counts; avoids clutter). Not valid: `remove_element`, `ask_verification` alone, `search_materials`.
- **No filler**: never write greetings or empty bullets to satisfy the rule; write the student's question as a title, the options being offered, or point at the element they mean. Short-reply examples for off-topic, "entendi", "manda a dúvida" (title = the student's question once asked).
- Fix the duplicate rule numbering ("8. In text mode…" → 10).

**2. Engine (`packages/tutor/src/turn-engine.ts`) — hold the question, deterministic fallback**
- Count successful board actions per turn (whole reply, all rounds).
- If a question `speak` arrives while the turn has 0 board actions: hold it. If the model keeps going, release it in order. At the end of the round, if still 0 board actions and not aborted: commit one `write_text` card built from the question text (`<p><b>…</b></p>`, column `side`), then the held question. Max once per turn; `MAX_ROUNDS` unchanged; abort drops what's held; the thinking bridge line never counts as a question; interrupted turns are skipped.
- `CONTINUE_TEXT`: when nothing is on the board yet, start with "Nothing is on the board yet: your next call is `write_text` or `draw`."
- Hold cost < 100 ms (hidden behind earlier audio); no extra LLM call.

**3. Measurement**
- `scripts/turn-bench.ts`, voice mode, ≥ 20 scripted messages (6 teaching, 5 meta/social, 5 off-topic, 2 clarification, 2 "não sei"), 3 runs each, History + Math.
- Accept when: **native board rate ≥ 90 %** (no fallback) and **100 % with fallback** on completed turns; **0 % silent teaching turns**; first board action p50 ≤ 2.5 s, p90 ≤ 4 s; 100 % still end with exactly one question; manual check: every board action relates to the reply (no filler). Interrupted turns reported separately; re-scan ~50 new live turns after deploy.
- Count "creates an element" vs "only points". Log the metric; putting it in the shared timing type needs the contracts owner's OK.

**4. Dropped:** the front "Mento está escrevendo…" ghost line (busy board with nothing drawn); `draw_diagram` mentions (belongs to Plan B).

**Owner:** `prompts/` and `packages/tutor` are Person 3's lane — implement with their OK. Estimate 2–3 h.

---

## Draft (pre-review)

> Status: draft for review (2026-10-31). Owner of the files: Person 3 (`prompts/`, `packages/tutor`). Product decision by the founder. Nothing implemented.

## 1. Why
"I want it to answer and already be drawing, writing on the board. I don't want it to answer things without writing on the board. Interactivity is the main focus of the product."

## 2. Evidence (production DB, 2026-10-31)
Scanned the stored events of the latest ~60 sessions: **185 tutor turns with speech, 36 (~19–24 %) had no board action at all.** Examples of silent turns:
- "Boa! Vamos de eclipses então. Você já viu algum eclipse…"
- "Isso mesmo, fases da Lua! Eu tinha te feito uma pergunta…"
- "Claro, Bento, manda a dúvida! Pode perguntar do jeito que quiser."
- "Consigo, sim, Bento! Posso desenhar outras cenas de Roma…"
- "Ah, desculpa, Bento, a minha voz tá falhando aí!…"
Pattern: short conversational, meta, off-topic and acknowledgement replies. (Some turns predate the latest prompt change of 2026-10-31 02:11; to re-measure after it.)

## 3. What exists
- `prompts/base.md` already has strong board rules (narrate every element, ≥1 draw per reply, ≥2 circles, checklist).
- `packages/tutor/src/turn-engine.ts` already **continues an unfinished reply** in another LLM round when it does not end with a question (nudge text at line ~70: "Continue the same reply: circle…").

## 4. Proposed changes
1. **Prompt rule (base.md, rules 1–2 and 8):**
   - "Every reply puts something on the board, including short, social or meta replies. Minimum: one `write_text` (a key word, the student's question rewritten as a title, the options you offer) or a `draw`/`draw_diagram`."
   - "Speak and write together: after the opening `speak`, the next action is a board action; never more than two `speak`s in a row without a board action in between."
   - Add examples for short replies: student says "manda a dúvida" → write "Sua dúvida:" title + empty bullet; off-topic → write the two options; acknowledgement → circle/highlight the element they mean.
2. **Engine guard (turn-engine.ts):** extend the "unfinished" condition: if the reply ended with a question but the reply had **zero board actions**, run one more round with a nudge "Before the question, put the key idea of this reply on the board (write_text or draw) and point at it." Max one extra round; log a metric `board_actions_per_turn`.
3. **Metric + check:** add to the turn timing/report and to `scripts/turn-bench.ts`: % of turns without board actions; target < 5 %.
4. **Front (Person 2, small):** show a subtle "Mento está escrevendo…" ghost line on the board while the tutor speaks and no board action has arrived yet (makes the board feel alive during the first second). Optional.

## 5. Risks
- Latency: an extra LLM round adds ~1–2 s to the few turns that need it; the first `speak` is already streamed, so perceived latency stays.
- Board clutter: forcing writing on trivial replies may add noise → allow `highlight`/`circle_annotate` on an existing element to count as a board action.
- Token cost: small.

## 6. Validation
Re-run the scan on new sessions after deploy; `turn-bench` with 20 scripted student messages including small talk/meta/off-topic; manual demo check.

## 7. Estimate
Prompt + engine guard + metric: 2–3 h (Person 3 or with their OK).
