# Whiteboard back-end: hand-off (2026-10-30, night)

> Written so another agent or tool can continue Person 3's work (whiteboard back-end) without this conversation. Read this first, then `workstreams/03-whiteboard-backend.md` and the spec `docs/superpowers/specs/2026-10-30-whiteboard-backend-design.md`.

## 1. Where things are

| Item | Where |
|---|---|
| Code | **`main`**: PR #5 (whole back-end) and PR #8 (MongoDB conversations, history, Haiku tutor, teaching loop) are merged. Start new work on a new branch from `main` |
| Commit style | `feat(whiteboard): <what you did>`, **no co-author lines** (founder's rule) |
| Prompt log | `prompts/sessions/03-whiteboard-backend/`: `all-prompts.md` (every founder prompt of the session, verbatim, in order), numbered entries with what was done, `log.md` index |
| Decisions | `docs/10-decisions.md` D48–D56 are this lane's |
| Front-end guide | `docs/frontend-integration.md` (every route, SSE message, history, voice) |
| Teacher-side data guide | `docs/teacher-data-integration.md` |
| Model latency research | `docs/superpowers/research/2026-10-30-tutor-model-latency.md` |

## 2. What works (verified 2026-10-30, 22:42 -03)

- **Turn loop:** `POST /api/sessions/:id/turn` streams tool calls over SSE; the board validates them; citations are checked; everything is stored in MongoDB (`sessions`, `events`, `evidence`).
- **History:** `GET /api/sessions` and `GET /api/sessions/:id` re-render a past session (board + transcript).
- **Voice:** Deepgram Nova-3 pt-BR in the browser with a short-lived token (`POST /api/voice/token`); ElevenLabs Flash v2.5 on the server (`GET /api/tts/:action_id`, PCM 24 kHz, word timings in `speech_alignment`). The founder is on a paid ElevenLabs plan (library voices need one).
- **Retrieval:** Voyage embeddings + Atlas Vector Search + Atlas Search (Portuguese), fused with RRF; a session's subject limits the materials.
- **Drawing and judge:** Gemini images (cached), Haiku judge records evidence.
- **Model (D55):** tutor `claude-haiku-5-5` with thinking disabled. Env `TUTOR_MODEL`, `TUTOR_THINKING`, `TUTOR_EFFORT`.
- **Numbers:** first action p50 1.8 s end to end, first audio byte ~0.35 s, 0 errors; all test suites pass (`pnpm test`; Atlas tests with `ATLAS_TEST_URI=$MONGODB_URI`).

## 3. How to test it end to end

1. `pnpm dev` (web :3000, API :4000; `.env` holds the keys).
2. Open `http://localhost:3000/dev/conversation`, choose **voz** and a subject, click **Iniciar conversa**. Use headphones: the mic stays open for barge-in, and the tutor's own voice can trigger an interruption without them.
3. Quick checks without a browser: `pnpm turn:bench 3` (latency), `pnpm voice:smoke` (TTS + STT).

## 4. Problem found in the founder's test (2026-10-30, 22:45)

Session `6ae548050b438ca0124cd292` (7 voice turns), read from `GET /api/sessions/:id`:

- **Every turn was one short `speak` and then one or two board blocks.** The tutor said "Vou te mostrar…" and never explained what it wrote. The student asked "Quem foi Júlio César?" four times; the tutor rewrote the same block three times (`cesar_quem_resp`, `cesar_quem_fala`, `cesar_quem_agora`).
- Cause: the prompt only asked to "alternate speak, board and questions"; Haiku 5.5 without thinking does the minimum. Latency was fine (first action 1.4–2.4 s), citations were right.
- "He did not hear me": not confirmed (the recording has no audio). Likely causes: no headphones (the tutor's voice triggers `SpeechStarted` and cuts itself) or Deepgram waiting for the end-of-speech pause.

## 5. Current work: a teaching tutor (founder's request, 2026-10-30)

Founder's goal (prompt 19 in the log): a tutor that is **very much a teacher**: knows how to lead a lesson, explains well, asks specific questions, and makes it **two-way**: the student learns by explaining. Didactic and fluid.

Plan (applied in `prompts/base.md` and `prompts/subjects/history.md`):

1. **Lesson loop:** hook (a question that connects the topic to the student) → explain in small steps, each board block narrated by a `speak` before and after it → the student explains it back or applies it → specific feedback → next step.
2. **Answer first, then ask:** a direct question gets a real answer in the same reply (2–4 speaks), then one question back. Never end on a promise ("vou te mostrar").
3. **One question per reply, at the end,** then stop and wait. Alternate kinds: recall, why/cause, "explique para um colega", apply to a new case, place on the timeline.
4. **Respond to the student's words:** acknowledge what is right, correct one misconception gently, build on it.
5. **Repeated question:** explain again from a different angle (analogy, example) and point at the existing block (`highlight`), do not rewrite it.
6. **Voice mode shape:** 3–6 `speak`s per reply, each one or two short sentences.

Measured result: see §6.

## 6. Result of the teaching prompt

**Root cause found during the test:** the prompt was not the main problem. The turn engine only called the model a second time after `search_materials`. The Anthropic API stops a message after tool calls (`stop_reason: "tool_use"`) to wait for their results; Sonnet used to put many calls in one message, Haiku puts one or two, so the reply ended after "speak + write_text".

**Fix (D56):**
- `packages/tutor/src/turn-engine.ts`: when the model stops with `tool_use` and the reply has not ended with a question, the engine sends the tool results plus "Continue the same reply…" and streams again, up to **4 rounds** per reply. It stops at `ask_verification`, at a `speak` with `purpose: "question"`, or at `end_turn`. The single `search_materials` round still works (searches are run once per reply). Tests in `turn-engine.test.ts` ("continuing the reply").
- `prompts/base.md`: new "Who you are", "How a reply is built" and "How you teach (the lesson loop)" sections with a worked example; `prompts/subjects/history.md`: guess-before-explain, concrete comparisons, student tasks.

**Scripted 5-turn lesson (voice, História subject), before → after:**

| | Before | After |
|---|---|---|
| `speak`s per reply | 1 (sometimes 2) | 2–4 |
| Reply ends with a question | rarely | every reply |
| Board blocks narrated by voice | no | yes (`highlight` on the block) |
| `ask_verification` in 5 turns | 1 | 2 (teach it back) |
| "Não sei, acho que ele era um rei?" | short correction | "Boa intuição!", explains why Romans feared kings, asks a follow-up |

**Latency (`pnpm turn:bench 3`):** first action p50 2.05 s, p95 3.09 s (was 1.79 / 2.56 s; the prompt is longer and the run varies); script done p50 4.8 s (later rounds stream while the first `speak` is playing, so the student does not wait for them). 0 errors; all tests pass.

**Not verified:** a person speaking in `/dev/conversation` with the new prompt.

## 7. Next steps (not started)

- Take the ~0.8 s Voyage query embedding off the critical path (first action p50 is 1.8 s; target 1.5 s).
- If Haiku still writes thin lessons after the prompt change, try Sonnet 5.5 with `TUTOR_THINKING=between_tools` (~2 s to the first action, fuller scripts) and compare in `/dev/conversation`.
- `getClassContext` and `getLearnerSummary` in `MongoTurnRepository` still return defaults: Person 1 owns the class and learner data.

## 8. Continuing with another AI tool

1. `git checkout main && git pull && pnpm install`. Copy `.env` from the founder (never commit it; names in `.env.example`).
2. Read, in order: `AGENTS.md` (repo rules), this file, `workstreams/03-whiteboard-backend.md`, the spec, `docs/10-decisions.md` D48–D56.
3. Run `pnpm test`, `pnpm dev`, then `/dev/conversation` (§3) to see the current state.
4. Keep the rules of this lane: repo files in English, product text in pt-BR; commits `feat(whiteboard): …` with no co-author lines; log every founder prompt verbatim in `prompts/sessions/03-whiteboard-backend/` (new numbered entry + a row in `log.md`); update `docs/10-decisions.md` when a decision changes.
5. Where to change the tutor: behaviour in `prompts/base.md` and `prompts/subjects/*.md` (loaded at API start: restart the API after editing); reply continuation and validation in `packages/tutor/src/turn-engine.ts`; model settings in `.env` (`TUTOR_MODEL`, `TUTOR_THINKING`, `TUTOR_EFFORT`).

