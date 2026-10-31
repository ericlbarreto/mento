# 16 — Technical roadmap

> Status: **proposed**, built from the product scope (`01-hackathon-scope.md`) and the Studdy teardown (`15-studdy-teardown.md`). Stack choices marked *(proposed)* still need the team's confirmation in `13-technical-discovery-and-split.md`.
> Last updated: 2026-10-30.
> **This document supersedes** the whiteboard-technology parts of `02`, `07` and `11` (tldraw as leading candidate, `board_op` as a canvas protocol) and refines the voice decision. See `10-decisions.md` (D18–D23).

We do not copy Studdy. We reuse the *mechanics* that make a live whiteboard tutor simple to build, and we add what the product is about: **teacher material grounding, citations, click-and-ask, evidence and the student picture.**

## 1. Core idea

The tutor is an LLM that emits a **script of tool calls**. The server streams the script over SSE. The client plays it in order: speak, write, highlight, circle, draw. **The LLM never produces pixels.** Every action is stored in an **event log**, which is also the state of the session, the source of evidence and the input to the analysis.

```
                          ┌───────────────────────── Client (web) ────────────────────────┐
 student speech/typing ─► │ Board (DOM)  Chat captions  Source chips + PDF viewer  Mic/TTS │
                          └───────────┬───────────────────────────────────▲───────────────┘
              POST /api/sessions/:id/turn  (events delta)        SSE stream of actions
                                      ▼                                   │
                          ┌────────────────────── Server ─────────────────┴───────────────┐
                          │ Turn handler                                                    │
                          │  1. append user event to log                                    │
                          │  2. assemble prompt: base + subject profile + class context     │
                          │     + learner summary + board snapshot + recent events         │
                          │  3. LLM with tools (streaming) ─► validate ─► emit SSE actions  │
                          │  4. server-side tools: record_evidence, ask_verification judge  │
                          │  5. draw tool ─► image model / SVG model (async)                │
                          └──────┬──────────────┬──────────────┬───────────────┬───────────┘
                              Database      File storage    LLM provider   Image/TTS providers
                            (events,       (PDFs, images)   (ZDR-capable)   (STT is browser→Deepgram)
                             evidence...)
```

## 2. Technology choices

| Area | Choice | Status |
|---|---|---|
| Frontend | React-based web app (e.g., Next.js, as Studdy uses) | *(proposed)* |
| Board | **DOM components in columns**, no canvas, no tldraw (D18) | Decided |
| Math | KaTeX (inline `$...$` in text and a `write_latex` tool); only for the optional Math profile | Decided |
| Handwriting fonts | Caveat / Kalam (Google Fonts). **Verify pt-BR accents render correctly (ã, ç, é)** | To verify day 0 |
| Server transport | HTTP POST + **SSE** for the turn stream | Decided |
| LLM | One tool-calling model for the tutor loop (a fast tier of the Claude family is the default candidate); a separate call for SVG diagrams; a cheaper model for post-session analysis. Pick by a 1-hour bake-off on the Rome script (latency, tool reliability in pt-BR, ZDR option) | *(proposed)* |
| STT | **Deepgram** streaming from the browser via WebSocket with a short-lived token minted by our server (Studdy does the same) | *(proposed)* |
| TTS | Bake-off: **ElevenLabs Flash v2.5 (default pick: naturalness + latency)** vs Azure Speech (fallback) vs Cartesia Sonic 3.6, in pt-BR. All three can provide word timing (Azure `WordBoundary`, ElevenLabs character alignment, Cartesia `add_timestamps`). **Deepgram Aura-2 excluded (no Portuguese).** Details and sources: `11` | Bake-off |
| Image model | Bake-off with 3 Rome prompts (style, latency, cost, background removal). Candidates: Google, OpenAI or open (Flux-class) image models | Bake-off |
| Database | **MongoDB + Mongoose** | Decided (D46) |
| File storage | Local disk for the hackathon (PDFs, generated images) | *(proposed)* |
| PDF viewer | pdf.js (page + text-layer highlight) | Decided |

## 3. The turn protocol

### 3.1 Request

`POST /api/sessions/:id/turn`

```json
{
  "appended": [ { "name": "user_message", "kind": "chat|speech|board_select|quick_action", "text": "...", "selected": {"element_id": "date_27bc", "text": "27 a.C."} } ],
  "modality": "text|voice",
  "interrupted": { "action_id": "...", "spoken_chars": 120 }
}
```

The server keeps the authoritative log; the client sends only what is new (Studdy sends a delta of the log plus a session head: topic, persona, flags).

### 3.2 Response (SSE)

Each SSE message is `event: <type>` + `data: <JSON>`, and the JSON always has a `type` (the union is `StreamMessage` in `@mento/contracts`; full list in `docs/frontend-contract.md`):

```json
{ "type": "action", "order": 0, "action": { "id": "act_1", "name": "write_text", "args": { "id": "title", "column": "main", "html": "<h1>…</h1>" } } }
{ "type": "action", "order": 1, "action": { "id": "act_2", "name": "speak", "args": { "text": "…", "audio_url": "/api/tts/act_2", "audio_format": "pcm_s16le_24000" } } }
{ "type": "speech_alignment", "action_id": "act_2", "words": [ { "word": "Hoje", "start_ms": 0, "end_ms": 260 } ] }
{ "type": "svg_chunk", "element_id": "diagram", "chunk": "<svg …" }
{ "type": "script_done", "turn_id": "turn_1" }
{ "type": "action", "order": 6, "action": { "id": "act_7", "name": "draw_result", "args": { "element_id": "colosseum", "url": "/files/gen/colosseum.jpg" } } }
{ "type": "turn_done", "turn_id": "turn_1", "timing": { "first_action_ms": 1380 } }
```

- `order` defines playback order; `speak` is the clock.
- `script_done` means every action of the script was emitted: the client opens the microphone after the last `speak`, without waiting for images. `turn_done` comes when pending images finished or timed out.
- Late results (`draw_result`) arrive after `script_done` and update an existing element.

### 3.3 Playback on the client

A single **action queue**:
1. Run actions in `order`. `speak` is the clock: it plays TTS (or shows captions in text mode) and resolves when done.
2. `write_*`, `highlight`, `circle_annotate` run instantly with their animation (typewriter reveal + pencil icon; circle with a stroke-dash animation).
3. `draw` inserts a **placeholder** and continues; the image/SVG replaces it when ready.
4. **Interruption** (new user message, speech start or typing): abort the SSE (`AbortController`), stop TTS, clear the queue, keep the board as is, and start a new turn with `interrupted` info.
5. Pause/resume = pause the queue.

### 3.4 Events (stored)

One append-only log. The event types and payloads are defined **once** in `workstreams/contracts-spec.md` §3: `session_started`, `user_message`, `tutor_action` (any tool call, including `draw_result`), `verification_asked`, `verification_answered`, `hint_given`, `evidence_recorded`, `interrupted`, `mic_state`, `turn_timing`, `session_ended`. The board state is derived from `tutor_action` events (no separate element events).

## 4. Tool catalog (Mento v1)

All args are validated by the server before streaming (types, ids, allowed columns). The model may only use these tools.

| Tool | Args | Effect |
|---|---|---|
| `speak` | `text`, `style?` (e.g., `warm`, `energetic`), `purpose?` (`explain`/`hint`/`praise`/`question`/`transition`), `hint_level?` (1–3, required for hints), `sources?`, `outside_material?` | Tutor speaks (voice) or shows a caption (text). Optional citation chips |
| `write_text` | `id`, `html`, `column`, `purpose?`, `hint_level?`, `sources?`, `outside_material?` | Handwritten text block (HTML allowlist: `h1–h3`, `p`, `b`, `i`, `br`, `ul/ol/li`, `span`) |
| `write_timeline` | `id`, `column`, `events:[{date, label}]` | **Deterministic** timeline component (exact dates; no model-drawn text) |
| `write_latex` | `id`, `latex`, `column` | Equation (Math profile only) |
| `highlight` | `target_id`, `color` | Marker highlight on an element |
| `circle_annotate` | `target_id`, `text_to_match`, `color` | Circle a substring inside an element |
| `draw` | `id`, `prompt`, `column`, `is_structured`, `max_dimensions` | Illustration (artistic image) or diagram (streamed SVG) |
| `remove_element` / `update_element` | `id` (+ `html`) | Change or remove an element |
| `ask_verification` | `concept`, `question`, `kind` (`explain`, `transfer`, `place_on_timeline`) | Puts a question on the board and **waits** for the student's answer |
| `record_evidence` | `concept`, `result` (`correct`/`partial`/`incorrect`), `independent`, `hints_used`, `rationale`, `citation?` | **Server-side only** (not rendered): writes an evidence row |
| `search_materials` | `query` | Main retrieval path for books (FTS over the chosen material); see §6 |

`sources` format: `[{ "material_id": 3, "page": 12, "quote": "…exact excerpt…" }]` (the `Citation` shape in `workstreams/contracts-spec.md` §4). Source of truth for citations: `04-knowledge-and-sources.md`.

### Example script (Rome, simplified)

```json
[
 {"name":"write_text","args":{"id":"title","column":"main","html":"<h1>Da República ao Império</h1>"}},
 {"name":"highlight","args":{"target_id":"title","color":"yellow"}},
 {"name":"speak","args":{"text":"Hoje vamos ver como Roma deixou de ser uma República.","style":"warm"}},
 {"name":"draw","args":{"id":"colosseum","column":"visuals","is_structured":false,
   "prompt":"Esboço artístico do Coliseu romano, lápis de cor, fundo branco, sem texto","max_dimensions":{"w":500,"h":400}}},
 {"name":"write_timeline","args":{"id":"tl","column":"main","events":[{"date":"509 a.C.","label":"Início da República"},{"date":"27 a.C.","label":"Otávio vira Augusto"}]}},
 {"name":"speak","args":{"text":"Repare nessa data: 27 a.C.","sources":[{"material_id":1,"page":12,"quote":"Em 27 a.C., o Senado concedeu a Otávio o título de Augusto"}]}},
 {"name":"circle_annotate","args":{"target_id":"tl","text_to_match":"27 a.C.","color":"red"}}
]
```

## 5. The board

### 5.1 Structure

- DOM only. The board has **spaces** (one per topic of the conversation) and **columns** (e.g., `main`, `visuals`, `side`). The model chooses a column, **never x/y coordinates**: this avoids overlaps and makes layout deterministic. The board scrolls horizontally as columns fill.
- Every element has a **stable `id`**, `type` (`text`, `timeline`, `image`, `svg`, `latex`, `question`), `author` (`tutor` | `student`), `column`, `created_at`, optional `sources` / `outside_material`.
- **Board state = replay of the event log**, so resuming a session and replay come for free (Must #7).

### 5.2 Visual language (from Studdy, adapted)

Handwriting font; pencil icon trailing the text being "written"; yellow blob **marker highlight** behind the target; **circle annotation** with stroke-dash animation; soft SVG **noise filter** (feTurbulence) on diagrams for a pencil texture; off-white background.

### 5.3 Click-and-ask (Mento differentiator)

1. Each element and each **text span** the tutor may reference is clickable/selectable.
2. The client sends `user_message` with `kind: "board_select"`, `selected: {element_id, text}` and the question (typed or spoken).
3. The prompt includes a **board snapshot** each turn: a compact list `id | type | column | text (truncated)` of everything on the board, plus the selected element in full. That is how the model can target `circle_annotate`/`highlight` and answer about *that* element.
4. The tutor answers about the element and may add an annotation, without restarting the conversation.

### 5.4 Safety

- HTML from the model passes through an **allowlist sanitizer** (no scripts, no event handlers, no external resources).
- Student-authored text is escaped.

## 6. Grounding and citations (materials)

- **Ingestion** (UI upload in the Materials tab, or `scripts/ingest.ts` as the fallback): PDF → per-page text (text layer first, vision only for pages that need it) → rows in `chunks` with `page` + FTS index + chapter outline; runs as a background job with status (`queued → processing → ready/failed`). Details: `04-knowledge-and-sources.md`.
- **Context per turn** = base prompt + subject profile (from the chosen material) + **class context** (grade level + description) + **retrieved pages of the chosen material** (FTS top-k + outline chapter; all pages only if the material is small; prompt-cached) + learner summary (open gaps, recent progress) + topic + board snapshot + last N events. Mid-turn lookups use `search_materials`.
- **Citation chips:** `sources` on `speak`/`write_text` render as chips (`Livro, p.12`). Clicking opens pdf.js at `page` and highlights `quote` by searching the text layer.
- **Outside the material:** the model sets `outside_material: true`; the UI marks the element/caption visibly.
- Validate citations server-side: the `quote` must actually occur in that chunk; otherwise drop the chip (avoids fabricated citations).

## 7. Drawing pipelines

### 7.1 Artistic image (`is_structured: false`)

1. Server receives the `draw` call and immediately emits a placeholder element.
2. Prompt sent to the image model = **fixed style prefix** (colored-pencil sketch, white background, no text, no frame) + the model's `prompt`.
3. Result stored as PNG (≈1.4k px wide is what Studdy shows; we only need ≤ `max_dimensions` × 2); optional background removal.
4. Server emits `draw_result` → client swaps the placeholder (fade-in).
5. **Cache by prompt hash**; **pre-generate** every image the demo script needs.
6. Never put text inside generated images; labels are separate `write_text` elements.

### 7.2 Structured diagram (`is_structured: true`)

1. A second LLM call writes SVG (fixed `viewBox`, limited palette, `data-descriptor` names on groups, short labels).
2. The SVG is **streamed** as `{"stream":"svg", ...}` chunks and rendered when complete (progressive rendering is optional).
3. **Sanitize** (allowlist of tags/attributes) before inserting; apply the shared noise filter for the pencil look.
4. For History, prefer **deterministic components** (`write_timeline`, later a simple map component) over free-form SVG when exact text/dates matter.

### 7.3 Demo guardrails

- Ship 4–6 pre-generated, reviewed images for Rome (Colosseum, aqueduct, legionary, Forum, map of the Empire, ship) as the **cache seed**; live generation is the stretch path.
- Fallback if generation fails or is slow: show a soft placeholder card with the caption; the conversation continues.

## 8. Evidence and analysis

1. `ask_verification` puts a question on the board and the tutor waits (`tutor_state: waiting`).
2. The student answers (chat or speech). A **judge call** (separate, small LLM call with the material excerpts and a rubric) decides `result` (`correct` / `partial` / `incorrect`); `independent` and `hints_used` are computed from the `hint_given` events between the question and the answer.
3. Server writes `evidence` (`concept`, `concept_key`, `result`, `independent`, `hints_used`, `rationale`, `citation?`, `session_id`, ts; spec §5) and emits `evidence_recorded`. Concept labels follow spec §7 so the teacher-side analysis can match gaps across sessions.
4. **Post-session analysis** (automatic after each conversation) reads the event log + evidence, writes `analyses.result` and creates **`insights`** (gap / progress / suggestion) for the teacher's Students tab and for the learner summary of the next conversation (`05-learner-model-and-analysis.md`).
5. A **diagnostic opener** (like Studdy's "how much do you remember, 1–10?") is cheap and gives a first evidence data point; we use it per concept, never as a score.

## 9. Voice (Should)

- **STT:** server endpoint `POST /api/voice/token` mints a short-lived (~30 s) token; the browser opens the Deepgram WebSocket directly; end-of-turn events become `user_message` (`speech`). Keys never reach the client.
- **Mic behavior:** auto-open after the tutor asks a question; mute otherwise; show state clearly (Studdy does this).
- **TTS:** the client requests audio per `speak` through a server proxy `POST /api/tts` (streaming), plays chunks with the Web Audio API, **prefetches the next `speak`** while the current one plays, and stops immediately on interruption. Captions highlight word by word if the provider returns word timestamps; otherwise sentence-level.
- **Style:** the `style` field maps to provider voices/styles per persona (persona names and tone live in `prompts/personas.md`).
- **Voice replies are short**; visuals go to the board.
- **Storage policy (D39):** store the **final STT transcript text** and the **spoken TTS text** as events; do **not** store raw audio; cache TTS audio by hash for reuse and demo fallback (purgeable). Details: `workstreams/03-whiteboard-backend.md` §"How STT and TTS are stored".

### Latency budget (targets, to be measured)

| Step | Target |
|---|---|
| End of user speech → turn request | ≤ 0.4 s |
| Request → first action (SSE) | ≤ 1.5 s (Studdy: 1.4–1.7 s) |
| First `speak` → first audio | ≤ 0.6 s |
| **End of speech → tutor audio starts** | **≤ 3 s** (Studdy's first tutor event came ~2 s after the user message; audio timing not measured) |
| Image placeholder → final image | a few seconds to ~10 s; never blocks speech |

## 10. Data model

The data model is defined in `07-architecture-and-data.md` (9 tables: `class_context`, `materials`, `chunks`, `students`, `sessions`, `events`, `evidence`, `analyses`, `insights`). Notes for the build:

- `sessions` carries `student_id`, `material_id`, `topic`, `persona`, `modality`.
- `events.payload` stores tool args and results (`url` of generated assets); assets live on disk, referenced by path.
- `evidence.rationale` (short text from the judge) feeds the teacher's "examples of reasoning".
- `insights` (`gap | progress | suggestion`) are written by the post-session analysis and read by the Students tab and by the learner summary of the next conversation.

## 11. API surface

Served by the **Fastify API** (`apps/api`, prefix `/api`; the browser calls `NEXT_PUBLIC_API_URL`; D43). Single teacher workspace: **no authentication** (prototype only).

| Endpoint | Purpose |
|---|---|
| `GET /api/students` | Student list (names for the picker; with counts for the teacher) |
| `POST /api/sessions` | Create a conversation (`student_id`, `material_id`, `topic?`, `persona?`) |
| `POST /api/sessions/:id/turn` | Turn request → SSE script |
| `GET /api/sessions/:id/events` | Event log (replay, resume, teacher view) |
| `POST /api/voice/token` | Ephemeral Deepgram token |
| `POST /api/tts` | Streaming TTS proxy |
| `GET /api/files/:id` | Material PDFs and generated images |
| `GET /api/overview` | Teacher metrics: students, conversations, gaps identified, insights generated |
| `GET /api/stream/teacher` | **SSE** live feed for the teacher UI (`insight_created`, `session_started`, `session_ended`, `material_status`) |
| `GET/PUT /api/class-context` | Read/update the global class context |
| `POST /api/students` | Create a student |
| `GET /api/students/:id` | Student detail: sessions, evolution (from evidence), insights |
| `PATCH /api/insights/:id` | Accept or dismiss an insight |
| `GET /api/materials`, `POST /api/materials` (multipart) | List / upload a PDF (starts background ingestion) |
| `GET /api/materials/:id` | Material status and metadata |
| CLI `ingest <pdf>` | Ingestion script fallback (not an endpoint) |

## 12. Build order (maps to the schedule in `01-hackathon-scope.md`)

| Hours | Deliverable |
|---|---|
| 0–2 | **Day-0 checks:** handwriting font with pt-BR accents; image-model bake-off; TTS bake-off; LLM tool-call reliability; confirm stack |
| 2–4 | **Hello-world turn:** `POST /turn` → SSE with a *fixture* script → client plays `write_text` + `speak` (captions) → events stored |
| 4–8 | Real LLM loop with the 3-layer prompt, board snapshot, all rendering tools; **fixture replay mode** so front and back develop in parallel |
| 8–12 | Click-and-ask; `draw` artistic (placeholder + cache) and `write_timeline`; interruption in text mode |
| 12–15 | Material ingestion (script; FTS + outline), retrieval in the turn, citations, pdf.js highlight, outside-material flag |
| 15–18 | `ask_verification` + judge + evidence; event-log persistence verified end to end |
| **18** | **Cut line** |
| 18–22 | Teacher **Students tab** (metrics, student detail, insights) + analysis → insights; then Materials upload and class-context form; voice last (see the cut order in `01`) |
| 22–24 | Rehearsal, pre-generation, bug fixing, text-mode fallback ready |

**Fixture mode** is the most useful parallelization tool: a JSON script (like the example above) replayed through the same SSE path lets the frontend team build the board without waiting for the LLM, and lets the prompt team iterate without a UI.

## 13. Lanes and contracts (proposal; not assigned)

> The **final split by person** (Person 1 teacher interface + data + insights, Person 2 whiteboard front-end, Person 3 whiteboard back-end) is in `workstreams/`. The table below is the earlier lane view.

| Lane | Scope | Depends on |
|---|---|---|
| **A. Board + student UI** | DOM board, action queue, animations, click-and-ask UI, source chips, pdf.js viewer, captions | Action schema, event schema |
| **B. Tutor core** | Prompts (incl. class-context layer), turn handler, tool validation, draw pipelines, retrieval in the turn, judge/evidence | Action schema, Repository |
| **C. Data + sources + teacher + voice** | Schema, event log, material ingestion + citation validator, teacher interface (Students, Materials, class context), analysis → insights, simulated data; voice adapter later | Event schema, Repository |

**Contracts to freeze in the first 2 hours:** (1) action/tool schema (§4), (2) SSE message format (§3.2), (3) event log shape (§3.4), (4) citation format (§6). Put them in `packages/contracts` as JSON Schema + examples.

## 14. Testing

- **Fixture scripts** for the Rome material (happy path, wrong answer, click-and-ask, out-of-material question, interruption).
- **Prompt regression:** rerun fixed conversations after every prompt change and compare tool sequences (not exact text).
- **Contract tests:** schema validation of every model-emitted action (reject unknown tools/columns/ids), and the **round-trip test** that runs a recorded fixture conversation through the repository and the teacher-side analysis input builder (`workstreams/contracts-spec.md` §10).
- **Latency log:** record per-turn timings (first action, last action, TTS first audio, image ready) from day 1.
- **Demo rehearsal** twice; text mode ready as fallback.

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Model emits bad scripts (too long, wrong order, no wait) | Strict tool schemas, short-script rule in the prompt, "end turn at a question" rule, fixtures to compare |
| Image quality/latency/cost | Pre-generate + cache; placeholder; style prefix; bake-off first; labels as separate text |
| Fabricated citations | Server-side quote check against the chunk |
| pt-BR handwriting font accents | Verify on day 0; pick another font if needed |
| Voice latency or provider issues | Text mode first; voice is Should; ephemeral tokens; cache TTS for demo lines |
| Unsafe model output (HTML/SVG) | Allowlist sanitizers; no raw HTML from students |
| Parallel work conflicts | Contracts frozen early; lane boundaries; fixture mode |
| ZDR claims | Say "ZDR-compatible"; verify provider terms; fictional data only |

## 16. Open questions (for `13-technical-discovery-and-split.md` and `10-decisions.md`)

1. Frontend/back stack and DB (Q1).
2. Which LLM, image model and TTS (bake-offs, Q4).
3. Handwriting font choice after the pt-BR accent test.
4. Progressive SVG rendering (nice) vs render-on-complete (simple).
5. Whether to ship the persona selector (Studdy's Alfrenzo/Rubie) in the demo; default one persona.
6. Where to run the judge for `ask_verification` (same model vs a smaller one).
