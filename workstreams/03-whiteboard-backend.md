# Person 3 — Whiteboard back-end (tutor core, voice, orchestration)

> Status: proposed plan, 2026-10-30. Builds on `docs/16-technical-roadmap.md`, `docs/03-tutor-and-prompts.md`, `docs/11-technology-research.md` (TTS/STT research). Seams: `handoffs-and-insights-pipeline.md`. **The founder pays for all services**, so model and provider choices go for **quality and latency first**; still log cost per session.

## Mission

Make the tutor feel **natural and fast**: orchestrate the LLM, retrieval, drawing, speech-to-text and text-to-speech so the student gets writing and speaking within ~1.5–3 s, and make sure **everything that happens is stored** so Person 1 can turn it into insights.

## You own (paths)

`packages/tutor/**` · `packages/voice/**` (server **and** the client hooks `useStt()`, `createSpeechPlayer()`) · `prompts/**` · the API route files `apps/api/src/routes/turn.ts` (turn SSE + end), `voice.ts` (STT token + TTS proxy) and `dev-fixtures.ts`, and **the API skeleton at K1** (`apps/api/src/server.ts`, SSE helper) — the backend service is Fastify (`docs/21-repo-structure.md`) · `scripts/turn-cli.ts`, `scripts/pregenerate-images.ts` · `fixtures/` (your own files).

## You consume / produce

| You consume | From |
|---|---|
| `Repository` (sessions, events, evidence, class context, search, pages, outline, citation validation, learner summary) | Person 1 |
| User events (`user_message`, `board_select`, `answer_submit`, `interrupted`) | Person 2 |
| **You produce** | **For** |
| The SSE script (actions) | Person 2 |
| Events, evidence, `session_ended` | Person 1 |
| STT token, TTS audio + word timings, `useStt()`, `SpeechPlayer` | Person 2 |

## Day-0 checks (≤ 1.5 h)

1. **LLM tool-call reliability and speed** on a fixture script: time to first tool call, valid JSON rate, and whether the model obeys "short first actions".
2. **Image model bake-off** (3 Rome prompts): style, latency, cost, background removal.
3. **TTS bake-off** with the 4 pt-BR lines in `docs/11-technology-research.md` (ElevenLabs Flash v2.5 default; Azure and Cartesia alternates); check **word timing** output and first-audio latency from the demo network. Also confirm whether `with-timestamps` style endpoints return audio + alignment in one call.
4. **STT**: mint a Deepgram ephemeral token, open the WebSocket, check Portuguese accuracy and end-of-turn behavior.

## Orchestrating for naturalness and low latency

### Latency budget (targets, to be measured)

| Step | Target |
|---|---|
| End of user speech/typing → turn request | ≤ 0.4 s |
| Request → **first action** on the SSE stream | ≤ 1.5 s (Studdy measured 1.4–1.7 s) |
| First `speak` → first audio | ≤ 0.6 s |
| **End of speech → tutor audio starts** | **≤ 3 s** |
| Image placeholder → image | seconds; never blocks speech |

### How to hit it

1. **Stream everything.** Use the LLM's streaming tool-use events; **emit each action over SSE the moment its JSON is complete** (do not wait for the whole script). The first actions must be short: the prompt requires "start with a one-sentence `speak` and a title `write_text`".
2. **Prompt caching** for the static prefix (base + subject profile + class context + retrieved pages), so only the new turn is processed.
3. **Retrieve before the LLM call**, not during: FTS (`searchChunks`) is milliseconds; preload the learner summary and class context once per session.
4. **Start slow work in parallel at tool-call time:** the image model is called as soon as `draw` arrives; structured SVG generation likewise; **TTS for each `speak` starts as soon as its text is final** (not at the end of the turn), and the next sentence is prefetched while the current one plays.
5. **Small, fast helper calls:** the judge and the analysis trigger use cheaper models and run **off the critical path** (judge only when an answer was submitted; analysis after the session).
6. **Keep connections warm:** HTTP keep-alive/HTTP2, provider clients created once, regions close to Brazil when available.
7. **Abort cleanly** (the SSE helper propagates an `AbortSignal` when the client disconnects): on `interrupted` or a new user message, cancel the in-flight LLM stream, drop queued TTS/image work, keep what already happened in the log.
8. **Timeouts and fallbacks:** per-call timeouts; if the LLM stalls, send a short `speak` ("Deixa eu pensar um instante…") and retry once; `DEMO_MODE=fixture` replays a recorded script.
9. **Measure from day 1:** log a `turn_timing` event per turn (first action, last action, TTS first audio, image ready) and print a latency report in `turn-cli`.

## The turn handler

1. Append the user event; load context: class context, learner summary (cached per session), board snapshot (from events), last N events.
2. **Assemble the prompt:** base + subject profile (from the material) + **course context** (= class context with grade-level register + retrieved pages + learner summary + topic) + modality hint (voice replies short).
3. Call the LLM with the **tool schema** (`docs/16` §4); validate every action with Zod (unknown tool/column/id → drop and log); sanitize HTML/SVG; **validate citations** with `validateCitation` and drop fake chips.
4. Emit SSE actions in order; persist each as a `tutor_action` event.
5. `ask_verification`: put the question on the board and **wait**; when `answer_submit` arrives, run the **judge**, write the `evidence` row and `evidence_recorded` event, and continue the lesson.
6. On `POST /api/sessions/:id/end` (Person 2) call `repository.endSession(...)` → `session_ended` → Person 1's analysis.

**Follow `contracts-spec.md` exactly** (it is what Person 1 reads): the event names and payloads (§3), the evidence `result` enum and `hints_used` (§5), hint signalling with `speak.purpose = "hint"` and `hint_level` (§6), and the **concept label rules** (§7: reuse the student's open-gap labels, then the material's chapter titles).

## Calling the APIs (STT, LLM, TTS, image)

| API | Where it is called | How |
|---|---|---|
| **LLM** (tutor, judge, SVG, analysis helper) | Server, `packages/tutor` | Official SDK, streaming + tool use; keys in `.env`; one client per process; retries with backoff on 429/5xx; request ids logged |
| **STT (Deepgram)** | Browser ⇄ Deepgram WebSocket | Your `POST /api/voice/token` mints a **short-lived token**; `useStt()` (client hook) handles mic, interim and final transcripts; finals become `user_message(kind=speech)` |
| **TTS (ElevenLabs Flash v2.5 default)** | Server proxy `POST /api/tts` | Input `{text, voice, style}`; returns audio plus **word timings** for captions; per-sentence request (simple and low latency); optional streaming later |
| **Image model** | Server, `packages/tutor` | Placeholder first; fixed style prefix; cache by prompt hash on disk (`data/files/gen/`); `pregenerate-images.ts` seeds the demo images |

Provider code lives behind **small functions** (`generateImage`, `synthesizeSpeech`, `mintSttToken`) so you can swap a provider after the bake-off without touching the turn handler.

## How STT and TTS are stored (answer to "como armazenar")

**Decision (D39): store text and timings, not audio.**

| What | Stored? | Where | Why |
|---|---|---|---|
| **STT final transcript** of the student | **Yes** | `events` row `user_message` with `{kind:"speech", text, stt:{provider,duration_ms,confidence}}` | It is the student's own words: evidence quotes and analysis input |
| STT interim transcripts | No | UI only | Noise |
| **Raw student audio** | **No** (by default) | — | Minors, privacy, cost; not needed for insights |
| **TTS text** the tutor spoke | **Yes** | `events` row `tutor_action` (`speak`) | The conversation record |
| **TTS audio** | **Cached, not archived** | `data/files/tts/<hash(text+voice+settings)>.mp3` | Avoids regenerating repeated lines, enables a demo fallback; purgeable at any time |
| Word timings | Transient (returned with the audio; may be cached with it) | Cache JSON next to the audio | Captions |
| Latency metrics | **Yes** | `events` `turn_timing` | Monitoring |

No student personal data goes inside TTS text or image prompts.

## Sending data to the teacher interface (Person 1)

Everything is written through the **`Repository`** (H2): `createSession`, `appendEvent` for **every** user message, tutor action, verification, hint and timing, `insertEvidence` after each judged answer, and `endSession` (which appends `session_ended` and triggers the analysis). Read from Person 1: `getClassContext`, `getLearnerSummary` (inject the open gaps into the prompt), `searchChunks`/`getPages`/`getOutline`/`validateCitation`. Event shapes: `handoffs-and-insights-pipeline.md` §3.

## Prompts and tools you author

`prompts/base.md` (pedagogy, citation rules, honesty outside the material, modality, answer in pt-BR), `prompts/subjects/history.md`, `generic.md`, optional `math.md`, `prompts/personas.md`, and the **class-context layer** (register for 7º–9º ano: shorter steps, relatable examples, warm tone; the description is teacher guidance, not facts). Tools: `speak`, `write_text`, `write_timeline`, `highlight`, `circle_annotate`, `draw`, `update_element`, `remove_element`, `ask_verification`, `record_evidence` (server-side), `search_materials`. The model must always choose a **column**, never coordinates, and must give each element a stable `id`.

## Drawing pipelines

- **Artistic image:** placeholder event → image model with the fixed style prefix (colored pencil, white background, no text) → store → `draw_result`; cache by prompt hash; never text inside images.
- **Structured diagram:** second LLM call streams SVG chunks (`{"stream":"svg",…}`); sanitize server-side too.
- **Timeline:** use the deterministic `write_timeline` (exact dates).

## Task list (order = priority)

| # | Task | Tier | Est. | Done when |
|---|---|---|---|---|
| T1 | Kickoff contracts (actions, SSE, events, citations, `Repository`, `SpeechPlayer`) with the others | Must | shared | Frozen |
| T2 | `turn-cli` + **fixture recorder** + `/api/dev/fixture-turn` support | Must | 2 h | Person 2 can build against fixtures by hour ~3 |
| T3 | Prompts: base, history, generic, personas, **class-context layer**, learner summary | Must 3 | 4 h | Rome script reads well at 8º ano level |
| T4 | Turn handler: streaming LLM, incremental action emit, Zod validation, SSE, abort | Must 1–2 | 5 h | First action ≤ 1.5 s; interruption works |
| T5 | Retrieval in the turn (FTS + `search_materials`) + `sources`, `outside_material`, citation validation | Must 4 | 3 h | Chips appear; fake quotes dropped |
| T6 | `draw` artistic pipeline + cache + pregeneration | Must 1 | 3 h | Demo images ready in cache |
| T7 | `ask_verification` + judge + `record_evidence` + events for everything | Must 6–7 | 3 h | A wrong answer yields an evidence row |
| T8 | `endSession` + `session_ended` trigger + `/api/sessions/:id/end` | Must 7 | 1 h | Leaving/idle/beacon end the session |
| T9 | STT token + `useStt()` + TTS proxy + `SpeechPlayer` + word timings + audio cache | Should 11 | 6.5 h | Voice round trip ≤ 3 s; captions highlight words |
| T10 | Structured SVG pipeline | Should | 3 h | A diagram streams and renders |
| T11 | Latency report + tuning (caching, parallelism, prefetch) | Should | 2 h | Targets met or gaps documented |
| T12 | Math subject profile | Nice 12 | 1.5 h | |

**Must ≈ 21 h, Should ≈ 11.5 h.**

## Acceptance criteria

- [ ] `turn-cli` returns valid scripts (grade-level register) for: happy path, wrong answer, click-and-ask, out-of-material question, interruption.
- [ ] First action ≤ 1.5 s and tutor audio ≤ 3 s after the student stops speaking (measured, reported).
- [ ] Every user message, tutor action, verification, evidence and `session_ended` is in the database for each conversation.
- [ ] No raw audio is stored; transcripts are.
- [ ] The prompt contains the class context and the student's open gaps (verified with Person 1).
- [ ] Fake citations are dropped; `outside_material` is set when appropriate.
- [ ] Fixture mode replays a full lesson when providers are down.

## Risks

- **Model emits long or badly ordered scripts** → strict schemas, short-first rule, fixtures to compare.
- **Provider latency spikes** → timeouts, bridging `speak`, cached demo audio/images, fixture mode.
- **Word timing mismatches** (normalization) → reconstruct words carefully; fall back to sentence captions.
- **Cost** is not a constraint, but log it per session to catch runaway loops.
