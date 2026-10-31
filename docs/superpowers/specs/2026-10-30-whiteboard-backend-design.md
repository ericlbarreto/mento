# Whiteboard back-end design (voice-first, performance-first)

> Status: **design approved by the founder, 2026-10-30; spec awaiting review.** Owner: Person 3 (tutor core, voice, orchestration). Builds on `workstreams/03-whiteboard-backend.md`, `workstreams/contracts-spec.md` (canonical shapes), `docs/16-technical-roadmap.md` and `docs/15-studdy-teardown.md`. Where this spec changes an earlier document, the change is listed in §10 and the other document must be updated.
> Provider facts below come from the providers' official documentation, read on 2026-10-30. Anything not confirmed is marked **[verify day 0]**.

## 1. Goal and non-goals

**Goal.** A voice-first tutor that feels natural: the student speaks, the tutor answers by voice while it writes and draws on the board, can be interrupted at any moment, and every turn is recorded for the teacher's analysis. Performance is the first design criterion.

**Targets (not yet measured).** First action on the stream ≤ 1.5 s (p50) and ≤ 2.2 s (p95); end of student speech → tutor audio starts ≤ 2.5 s. Reference: Studdy measured the first action at 1.4–1.7 s and the first tutor event ~2 s after the student's message (`docs/15`).

**Non-goals.** Teacher UI, analysis and ingestion (Person 1); board rendering, action queue UI and orb (Person 2); math profile; Flux eager turns (phase 2, only if measured to help).

## 2. End-to-end flow

1. Start screen picks the student only (founder decision, 2026-10-30: the student does **not** choose a material; the AI searches all of the teacher's materials) → `POST /api/sessions` `{student_id, modality: "voice"}` → `{id}`. The server **pre-warms the prompt cache** and opens the TTS connection.
2. Browser: `POST /api/voice/token` → opens the Deepgram WebSocket **at session start** and streams the microphone.
3. The tutor opens the conversation (first turn has no student message; greeting audio is cached).
4. Student finishes speaking → browser sends `POST /api/sessions/:id/turn` → SSE stream of tutor messages.
5. Browser plays the actions in order; `speak` is the clock. Mic opens after the last `speak` (`script_done`).
6. Student speaks over the tutor → Deepgram `SpeechStarted` → player stops, fetch aborted → server cancels everything → next turn carries `interrupted`.
7. Leaving → `POST /api/sessions/:id/end` → `session_ended` → Person 1's analysis.

## 3. Transport (decision: SSE for the turn + prefetched audio over HTTP)

- Turn actions and alignment over one SSE response (`apps/api`, Fastify, `openSse` helper).
- Tutor audio is **not** inside the SSE: each `speak` action carries `audio_url`; the browser fetches it (chunked PCM) the moment the action arrives, so audio is ready when the queue reaches it.
- STT is browser → Deepgram directly (short-lived token); the audio never passes through our server.
- Rejected: one WebSocket per session for everything (replaces the planned protocol, more reconnect logic); browser → ElevenLabs direct with a single-use token (loses server cache/fallback and server-side timing; token flow not documented).

## 4. Contracts (additions to `contracts-spec.md`, snake_case, ids are strings)

All defined as Zod schemas in `@mento/contracts`; types derived from them.

**Turn stream** (`stream.ts`): a union tagged by `type`:
- `action` `{ order, action: { id, name, args } }`
- `svg_chunk` `{ element_id, chunk }`
- `speech_alignment` `{ action_id, words: [{ word, start_ms, end_ms }] }` (server converts ElevenLabs character timings into words; times are absolute from the start of that `speak`'s audio)
- `script_done` `{ turn_id }`: every action of the script was emitted (the client opens the mic after the last `speak`; it does not wait for images)
- `turn_done` `{ turn_id, timing? }`: everything finished, including pending images or their timeout
- `error` `{ code, message, recoverable }`

**`speak` args** gain `audio_url` and `audio_format` (`pcm_s16le_24000`) in voice mode; none in text mode. Existing fields (`text`, `style`, `purpose`, `hint_level`, `sources`, `outside_material`) are unchanged.

**Audio endpoint:** `GET /api/tts/:action_id` returns chunked PCM; headers carry the format.

**Student captions (client side):** `useStt()` emits `SttCaption { kind: "interim" | "final", text, words: [{ word, start_ms, end_ms, confidence }], speech_final }`. Only `user_message.text` and `stt { provider, duration_ms, confidence }` are sent and stored; word timings are not stored.

**Interruption:** request body `interrupted: { turn_id, action_id?, spoken_chars?, spoken_ms? }`.

**Board element ids.** The model chooses each element `id` (stable, short, unique per session) and a `column`, never coordinates. The server derives the board state from `tutor_action` events, includes a compact snapshot (`id | type | column | text`) in every prompt, and validates every reference: `highlight`/`circle_annotate` must target an existing id and `text_to_match` must occur in it; reusing an existing id in `write_text` is an error (only `update_element` changes an element). Student selection sends `user_message` kind `board_select` with `selected { element_id, text }`, where the id comes from the DOM element the client rendered from the action.

## 5. Voice

**STT (Deepgram).** `POST /api/voice/token` calls `POST /v1/auth/grant` (key needs Member level or higher; default TTL 30 s) and returns the JWT. Model `nova-3`, `language=pt-BR` **[verify day 0 in streaming]**, `interim_results=true`, `endpointing` + `utterance_end_ms` (≥ 1000) for end of turn (`speech_final` ends the turn; `UtteranceEnd` is the fallback), `vad_events=true` for `SpeechStarted`, `keyterm` for the lesson's names **[verify pt]**. Audio: 16 kHz PCM from an AudioWorklet, `echoCancellation` on. `KeepAlive` only when no audio flows (a control message); the connection drops after ~10 s without audio. Browser auth for the temporary token: **[verify day 0]** (the documented example shows `["token", api_key]`; the JWT format is not documented on the pages read).
Phase 2, only if measured to help: Flux (`/v2/listen`, ~260 ms end-of-turn detection, `EagerEndOfTurn`/`TurnResumed`; +50–70 % LLM calls). Portuguese support in `flux-general-multi` is not confirmed.

**TTS (ElevenLabs, server side).**
- Model `eleven_flash_v2_5` (~100 ms median latency, Portuguese supported); `eleven_v4_turbo` (~100 ms) is a bake-off candidate.
- One persistent WebSocket per session (`stream-input`, `auto_mode`, flush per `speak`), reopened after the inactivity timeout (20 s default). Synthesis of the first sentence of a `speak` starts as soon as the tool block closes, in parallel with the rest of the LLM script. `previous_text`/`next_text` keep prosody across sentences.
- Alignment arrives per character and relative to each chunk; the server accumulates offsets and groups characters into words using the original (not normalized) alignment.
- Fallback when the WebSocket misbehaves: `POST /v1/text-to-speech/{voice_id}/with-timestamps` (audio base64 + alignment in one response).
- Cache by hash(text, voice, model, settings) on disk (audio + alignment); greeting and fixed lines pre-generated. Region: check `x-region`; `https://api.us.elevenlabs.io` forces US. First-byte time from Brazil **[verify day 0]**.
- If the first byte takes longer than 1.5 s: captions only, the conversation continues, the incident is logged.
- No student name or personal data in TTS text. Zero-retention (`enable_logging=false`) is enterprise-only, so assume ElevenLabs logs the text.

**Interruption cascade.** Client: stop the player, abort the turn fetch. Server: the `AbortSignal` of the connection cancels the Anthropic stream, closes the ElevenLabs context and stops image jobs. Nothing keeps running.

**Storage (D39 unchanged).** Store the final transcript text and the spoken text as events; never raw audio; TTS audio is a purgeable cache.

## 6. The turn (LLM)

- **Models.** Tutor: `claude-sonnet-5-5` (no extended thinking, to be confirmed by measurement). Judge: `claude-haiku-5-5`. Analysis: `claude-sonnet-5-5` (Person 1's call). Model ids come from `TUTOR_MODEL`, `JUDGE_MODEL`, `ANALYSIS_MODEL`.
- **Streaming tool use.** `eager_input_streaming: true` on large tools (`write_text`, `draw`); accumulate `input_json_delta`, guard the parse. The model returns several tool blocks; each block is validated and emitted the moment it closes. Invalid or truncated JSON drops only that action.
- **Prompt cache layout** (tools → system → messages): `[tools][system: base + all subject profiles (the tutor applies the one that fits the topic) + class context + learner summary][catalog of the teacher's materials: title, subject, chapters]` with breakpoints; after the breakpoints go recent history, the board snapshot, the passages retrieved for this turn (§6.1) and the student's message. The first turn has no student message: the tutor asks what to study, proposing topics from the catalog and the student's open gaps. Tool definitions, `tool_choice` and thinking settings must not change mid-session. Minimum cacheable prefix is 512 tokens for these models. Cache pre-warm with `max_tokens: 0` at session creation.
- **Short-first rule** in the prompt: begin with a one-sentence `speak` and a title `write_text`.
- **Retrieval.** Hybrid search (vector + text) over **all** materials; see §6.1.
- **Validation.** Unknown tool, column or id → dropped and logged; HTML sanitized; `sources` checked with `validateCitation` (a false citation loses its chip, not the action).
- **Persistence off the critical path.** Emit first; write `tutor_action` events through an ordered queue; board state is kept in memory per session and rebuilt from events.
- **Verification and judge.** `ask_verification` puts the question on the board and ends the turn. When the answer arrives, the next tutor turn and the judge run **in parallel**; the judge only writes the evidence (`result`, `independent`, `hints_used` computed from `hint_given` events). Tutor/judge disagreement is measured; if it is high, the verdict is passed to the next turn.
- **Failure handling.** Per-call timeouts; no first action within 3 s → a bridging `speak` ("Deixa eu pensar um instante…") and one retry; 429/5xx → one retry with short backoff; unrecoverable → `error` message with `recoverable`. `DEMO_MODE=fixture` replays a recorded script.
- **Ending.** `POST /api/sessions/:id/end` → `repository.endSession(...)` → `session_ended` (the analysis trigger, Person 1).

## 6.1 Retrieval: how the LLM reaches the vector store

**Store.** MongoDB (Atlas for everyone; plain local `mongod` has no `$vectorSearch`). Collection `chunks`: `{ material_id, subject, chapter, page, passage_idx, text, embedding }`. One passage = ~300–500 tokens inside a single page, so every hit has one page number. Two indexes (the Atlas free tier allows 3 search/vector indexes in total): a **vector** index on `embedding` (1024 dimensions, cosine, pre-filter fields `material_id` and `subject`) and an **Atlas Search** text index (Portuguese analyzer **[verify day 0]**). Indexes are created by `scripts/ingest.ts`.

**Ingestion (Person 1, `packages/sources`).** PDF → text per page from the PDF text layer; pages without text go through Gemini (PDF input) → passages → embeddings → `chunks`. Reducto is not used (founder: keep cost low; revisit only if the real book turns out to be scanned or table-heavy **[verify day 0]**).

**Embeddings.** Default: Voyage `voyage-4` (1024 dimensions, `input_type` `document` for passages and `query` for questions, $0.06 per 1M tokens, first 200M tokens free per account: a book of ~150k tokens costs $0). Comparison candidate: `gemini-embedding-2` (reuses the Gemini key). Neither page names Portuguese explicitly, so the day-0 check is a blind test of ~20 Portuguese questions about the real book.

**The LLM never sees embeddings or the database.** Person 3 calls one function owned by Person 1: `searchChunks({ query, k, material_id?, subject? }) → Chunk[]` (embedding, both searches and rank fusion happen inside `@mento/sources`). Rank fusion is done in application code (reciprocal rank fusion of the vector and text result lists), because the hybrid operator syntax was not documented on the pages read.

**Two ways the tutor gets passages (both use the same function):**
1. **Pre-retrieval, every turn, before the LLM call.** Query = the student's message plus the last tutor topic (so "e depois?" still works); for a board selection the selected text is added. Embedding the query and both searches run in parallel with the `user_message` write; top 6 passages are placed after the cache breakpoints, each labeled `[material_id · page · chapter]`. Skipped for pure acknowledgements. This keeps the LLM's first action fast: no tool round trip.
2. **Tool `search_materials` `{ query, material_id?, subject?, k? ≤ 8 }`**, a server-executed tool for when the pre-retrieved passages are not enough. The result is `[{ material_id, page, chapter, text, score }]`. The model should first emit a short `speak` ("Vou conferir no livro…"), which is streamed and spoken while the search runs; the server then returns the `tool_result` and the model continues (second request, prompt cache hit). Limit: one search per turn, two at most.

**Citations.** The model cites by copying `material_id`, `page` and an exact `quote` from a passage it was given. `validateCitation` first checks that the quote is a substring of a passage retrieved in this turn (in memory), then falls back to the database. A failing citation loses its chip, not the action.

**`outside_material`.** The prompt requires `outside_material: true` when no provided passage supports the statement; the server logs turns where the best score is low and sources are empty, to tune the rule.

**Cost.** Embeddings are free in the demo (Voyage free allowance); Atlas free tier; Gemini only for pages without text.

## 7. Drawing

- **Rule:** drawing never blocks speech or other actions.
- **Illustration:** when the `draw` block closes, the action itself is emitted (placeholder with column and size) and the image job starts immediately; `draw_result { element_id, url }` follows. Cache by hash(prompt, style prefix, model). Fixed style prefix (colored pencil, white background, no text, no frame); labels are separate `write_text` elements; no student data in prompts. Timeout ≈ 12 s → a caption card replaces the placeholder. A job cancelled by an interruption still finishes into the cache but emits nothing. At most 2 concurrent jobs per session; cost logged per image.
- **Image model: Google Gemini (founder's choice).** Candidates `gemini-3.1-flash-lite-image` (fastest/cheapest, 1K only) and `gemini-nano-banana-2.1`; both $0.0336 per 1K image (standard tier, Google pricing page, 2026-10-30). Request via `/v1beta/interactions` with `response_format { type: "image", mime_type, aspect_ratio, image_size }`; `thinking_level: "minimal"` to cut time. Transparency is not documented: the front uses `mix-blend-mode: multiply` so the white background disappears on the beige board. The API key needs billing enabled (the free tier returned a limit of 0 requests/day for the flash-lite model on 2026-10-30). The pre-generated seed (4–6 reviewed Rome images) is the demo's safety net. GPT Image (`gpt-image-2.5-flare`) stays a comparison candidate only.
- **Timeline:** deterministic component; the server only validates the `events` array.
- **Structured SVG** (Should): second Sonnet call streaming `svg_chunk`, sanitized server-side.

## 8. Measurement

`turn_timing` event per turn with: request received, context ready, LLM first token, first action emitted, TTS first byte, first audio chunk sent, `script_done`, `turn_done`. `turn-cli` prints p50/p95 per stage. The client reports end-of-speech → audio-start measured in the browser in its next turn request. Pass/fail gates are the targets in §1.

## 9. Tests (how the two sides provably match)

1. Zod schemas in `@mento/contracts` are the single definition; fixtures in `fixtures/turns` and `fixtures/events` are validated by `fixtures:check` in CI.
2. **Contract test:** `GET /api/dev/fixture-turn` and the real turn handler (driven by a fake LLM that replays a recorded Anthropic stream) are checked by the same test against the `StreamMessage` union.
3. Unit test of the alignment → words conversion (accents, several chunks, offset accumulation).
4. Abort test: closing the connection cancels LLM, TTS and image jobs (fake providers count calls).
5. Round trip with Person 1: fixture events → in-memory repository → `buildAnalysisInput`.
6. Front hand-off: contracts + fixtures + `/api/dev/fixture-turn` are delivered first so Person 2 integrates before the LLM exists.

## 10. Changes to earlier documents (to apply with this spec)

| Document | Change |
|---|---|
| `docs/16` §3.2 | Replace the `{order, action}` / `{done}` SSE shape with the tagged union of §4 (adds `speech_alignment`, `script_done`, `turn_done`, `error`) |
| `docs/16` §9, `workstreams/03` | TTS: server-side prefetch with a persistent ElevenLabs WebSocket and `GET /api/tts/:action_id` instead of per-sentence `POST /api/tts` |
| `workstreams/03` Day-0 checks | Image model decided (Gemini); Day-0 list in §11 |
| `contracts-spec.md` | Add the new stream messages, `audio_url`/`audio_format`, `SttCaption`, `spoken_ms`, `script_done` (additive, per its §11) |
| `docs/10-decisions.md` | New decisions: voice-first with SSE + prefetched audio; Gemini for images; Sonnet 5.5 tutor / Haiku 5.5 judge; judge in parallel |
| `contracts-spec.md` (sessions/repository) | `session_started` payload loses `material_id`; `Repository.createSession` no longer takes `material_id`; `searchChunks({ query, k, material_id?, subject? })`; `chunks` gains `embedding`, `subject`, `chapter`, `passage_idx` |
| `docs/04`, `docs/21`, `workstreams/01` | Ingestion adds embeddings and the two Atlas indexes; retrieval is across all materials; `packages/db` and `packages/sources` expose `searchChunks`; start screen picks the student only (`workstreams/02`) |
| `.env.example` | `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `VOYAGE_API_KEY`, `TUTOR_MODEL`, `JUDGE_MODEL`, `ANALYSIS_MODEL` |

## 11. Day-0 checks (≈ 1.5 h) and open items

1. Deepgram: browser auth with the temporary JWT; Nova-3 `pt-BR` streaming accuracy on a student-like voice; `keyterm` in Portuguese; Flux Portuguese support.
2. ElevenLabs: first-byte time from Brazil (WebSocket vs HTTP), alignment quality in Portuguese, voice choice (`ELEVENLABS_VOICE_ID`), `x-region`.
3. Anthropic: time to first tool block with `eager_input_streaming`; cache hit rate with the layout of §6; rate of invalid JSON and wrong ids on the Rome script.
4. Gemini: time per image for both candidates (3 images × 2 rounds), text/frame leakage, style consistency; billing enabled.
5. Retrieval: blind test of ~20 Portuguese questions on the real book for Voyage `voyage-4` vs `gemini-embedding-2`; Portuguese analyzer in Atlas Search; time to embed a query; whether the book's PDF has a text layer (decides whether Reducto is ever needed); vector search on the team's Atlas tier.
6. Open: the ZDR status of the Anthropic account (students may be minors); whether the tutor's `purpose`/`hint_level` is reliably set.

### Day-0 results (measured 2026-10-30, from the founder's network in Brazil)

| Check | Result |
|---|---|
| ElevenLabs `eleven_flash_v2_5`, HTTP `with-timestamps` (one 75-character sentence, ~5.3 s of audio, premade voice used only for the measurement) | First (and only) byte after 455–475 ms; 16 word timings, accents correct |
| ElevenLabs `eleven_flash_v2_5`, WebSocket `stream-input` with `auto_mode` | First audio chunk after 342–452 ms; same 16 word timings. **Meets the ≤ 600 ms target**; `TTS_MODE=ws` stays the default |
| Deepgram Nova-3 `pt-BR` streaming (server key, 24 kHz linear16 of the TTS audio) | Heard "27 antes de Cristo, o senado deu a Otávio o título de Augusto." (dropped the first word "Em"; `smart_format` turned "vinte e sete" into "27"). Portuguese streaming works |
| Deepgram temporary token (`POST /v1/auth/grant`) | **HTTP 403** with the current key: the key needs the Member role or higher. Browser subprotocol for the JWT still to verify |
| ElevenLabs voice list | The current key lacks `voices_read`; the pt-BR voice still has to be chosen in the ElevenLabs UI (`ELEVENLABS_VOICE_ID`) |
| Gemini images, `gemini-3.1-flash-lite-image` (6 Rome prompts × 2 rounds) | p50 5.1 s, max 5.8 s, ~0.7–1.0 MB JPEG, $0.40 for 12 images. Colored-pencil style, white background, no text or frame. **Default** (`IMAGE_MODEL`) |
| Gemini images, `gemini-nano-banana-2.1` (same prompts) | p50 15.1 s, max 42.3 s: slightly more faithful scenes (ruined Colosseum, togas) but often above the 12 s draw timeout. Not used live; can seed the cache offline |
| Anthropic `claude-sonnet-5-5`, direct (`pnpm llm:smoke`, 3 runs × 2 scenarios) | First token 0.70–1.00 s; first complete tool block 1.46 s (opening) and 1.49–1.95 s (student question); 27/27 tool blocks valid; prompt cache read 4,744 tokens on every call (pre-warm works) |
| End to end through the API (`pnpm turn:bench 1`, text mode, empty retriever) | First action 1.6 / 2.3 / 3.0 s on turns 1–3 (p50 2.3 s, **above the 1.5 s target**); the 3.0 s value is the bridging `speak`; script done 3.5–9.5 s; 0 errors. Follow-up: emit the first `speak` sentence before its block closes, keep the transcript shorter, and compare `claude-haiku-5-5` for the tutor |
