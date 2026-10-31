# Contracts spec — the one canonical definition of the shared shapes

> Status: **canonical, proposed 2026-10-30**; to be frozen in `packages/contracts` (Zod) at kickoff. If any other document disagrees with this file, **this file wins** and the other document must be fixed. Used by Person 1 (teacher side), Person 2 (whiteboard front-end) and Person 3 (whiteboard back-end). Pipeline narrative: `handoffs-and-insights-pipeline.md`; turn protocol: `docs/16-technical-roadmap.md` §3–4.

## 0. Why this file exists (alignment audit, 2026-10-30)

An audit of the docs found that the teacher side and the whiteboard back-end described the same data in **different shapes**. They are fixed here:

| # | Mismatch found | Resolution (this spec) |
|---|---|---|
| 1 | Event types differed between `docs/16` §3.4 (`element_added`, `mic_muted`…), `handoffs` (`verification_asked`, `hint_used`, `session_ended`…) and `docs/07` (`user_text`) | One event list: §3 |
| 2 | `kind` vs `type` for user messages; `snake_case` (`element_id`, `outside_material`) vs `camelCase` (`elementId`, `outsideMaterial`) | One casing rule: §1 |
| 3 | Citations as `{source_id}` (`docs/16`) vs `{material_id}` (`docs/04`) | `{material_id, page, quote}`: §4 |
| 4 | Evidence stored `correct` as a boolean, but the judge returns `correct / partial` | `result` enum: §5 |
| 5 | `independent` needs hint data, but **no event or tool produced hints** | `speak.purpose` / `hint_level` → `hint_given` event: §3, §6 |
| 6 | Concept labels are free text written by two different people (tutor/judge and analysis); gaps would not match across sessions | Shared `concept` + `concept_key` rules: §7 |
| 7 | Evidence stored `chunk_id` while citations use `material_id + page + quote` | `citation` JSON on evidence: §5 |

## 1. Conventions

- **Field names are `snake_case` everywhere a shape is stored or serialized** (SSE messages, HTTP bodies, `events.payload`, analysis JSON, DB columns) **and in the TypeScript types of those objects**. `camelCase` is only for local variables and function names. (One convention means no mapping code and no mismatches.)
- **Ids (D46, MongoDB):** DB documents have an `_id` ObjectId, exposed in every contract as `id: string` (24-hex). Wherever the sketches below show `id: number` / `*_id: number`, read `string`; `Event.id` ordering uses the ObjectId (monotonic per process) or a `seq` counter. Board elements, actions, turns and verifications have string ids (`el_…`, `act_…`, `turn_…`, `ver_…`).
- **Timestamps:** ISO 8601 UTC strings in JSON; `ts` columns store the same string.
- **Enums are closed lists** (below); unknown values are rejected by Zod, not silently stored.
- **No student names** in anything sent to an LLM; the id only.

## 2. Event envelope

```ts
type Event = {
  id: number;            // returned by appendEvent; insight evidence points to it
  session_id: number;
  ts: string;
  type: EventType;       // §3
  payload: unknown;      // shape depends on type (§3)
};
```

## 3. Event taxonomy (the only list)

| `type` | Written by | `payload` | Read by |
|---|---|---|---|
| `session_started` | Repository (`createSession`) | `{ student_id, subject_id: string \| null, topic?, modality, persona? }` (`subject_id` null = free whiteboard, which searches all materials; D47, D54, §14) | Analysis |
| `user_message` | Person 3 (turn handler) | `{ kind: "chat" \| "speech" \| "board_select" \| "quick_action", text, selected?: { element_id, text? }, stt?: { provider, duration_ms, confidence? } }` | Analysis, replay |
| `tutor_action` | Person 3 (each streamed action) | `{ turn_id, action_id, order, name, args }` (`name` = a tool in `docs/16` §4, including `draw_result`) | Analysis, replay, board state |
| `verification_asked` | Person 3 | `{ verification_id, element_id, concept, concept_key, question, kind }` | Analysis |
| `verification_answered` | Person 3 | `{ verification_id, element_id, answer }` | Analysis |
| `hint_given` | Person 3 (derived from `speak.purpose = "hint"`) | `{ turn_id, level: 1 \| 2 \| 3, verification_id?, concept_key? }` | Analysis |
| `evidence_recorded` | Person 3 (after the judge) | `{ evidence_id, verification_id?, concept, concept_key, result, independent, hints_used, rationale, citation? }` | Analysis |
| `interrupted` | Person 3 | `{ turn_id, action_id? }` | Analysis (optional) |
| `mic_state` | Person 3 (voice) | `{ muted: boolean }` | — |
| `turn_timing` | Person 3 | `{ turn_id, first_action_ms, last_action_ms, tts_first_audio_ms?, image_ready_ms? }` | Monitoring |
| `session_ended` | Repository (`finishSession`) | `{ reason: "user_left" \| "idle_timeout" \| "beacon" \| "manual" }` | Triggers the analysis on an active → ended transition |
| `session_resumed` | Repository (`resumeSession`) | `{ previous_ended_at: string }` | Audit/replay boundary; ignored by analysis input |

**Client → server messages** (sent over HTTP; stored only as the events above):

| Message | Fields | Stored as |
|---|---|---|
| user message | `{ kind, text, selected?: { element_id, text? } }` | `user_message` |
| answer to a verification | `{ verification_id, element_id, answer }` | `verification_answered` (+ a `user_message` of kind `chat`/`speech` if typed or spoken) |
| interruption | `{ turn_id, action_id?, spoken_chars? }` | `interrupted` |
| end of conversation | `POST /api/sessions/:id/finish` `{ reason }` (`/end` is a compatibility alias) | `session_ended` (via `finishSession`) |
| resume conversation | `POST /api/sessions/:id/resume` | `session_resumed` (via `resumeSession`) |

**Not events:** the board's current state is **derived** from `tutor_action` events (including `draw_result`); there are no separate `element_added/edited` events in our system (those were Studdy's naming). Raw audio is never stored.

## 4. Citation

```ts
type Citation = { material_id: number; page: number; quote: string };
```

Used in `sources[]` on `speak`/`write_text` and in `evidence.citation`. The `quote` must occur in that material page (validated by Person 1's `validateCitation`).

## 5. Evidence and the judge

```ts
type Evidence = {
  id: number; session_id: number; student_id: number;
  concept: string;                 // human label, pt-BR, ≤ 60 chars
  concept_key: string;             // normalizeConcept(concept), §7
  result: "correct" | "partial" | "incorrect";
  independent: boolean;            // true when no hint was needed for this answer
  hints_used: number;              // hints given between the question and the answer
  rationale: string;               // short, from the judge
  citation?: Citation;
  ts: string;
};
```

DB `evidence` columns: `id, session_id, student_id, concept, concept_key, result, independent, hints_used, rationale, citation (JSON, nullable), ts`. (Replaces the earlier `correct` boolean and `chunk_id`.) The judge returns `{ result, independent, rationale }`; `hints_used` and `independent` are **computed from the `hint_given` events** between `verification_asked` and `verification_answered`.

## 6. Hints (so `independent` is real)

The tutor's `speak` (and `write_text`) accepts two optional fields: `purpose: "explain" | "hint" | "praise" | "question" | "transition"` and `hint_level: 1 | 2 | 3` (required when `purpose = "hint"`). The turn handler emits a `hint_given` event for each. The prompt must tell the model to set `purpose = "hint"` whenever it gives a hint on an open verification.

## 7. Concepts (shared vocabulary)

- `concept` is a short pt-BR label; `concept_key = normalizeConcept(concept)` where `normalizeConcept` is **one shared function in `@mento/contracts`**: lowercase → Unicode NFD → strip diacritics → non-alphanumeric to space → collapse spaces → trim.
- **Person 3 must reuse labels** in this priority: (1) labels of the student's **open gaps** (from `getLearnerSummary`); (2) **chapter/section titles** of the materials of the chosen subject (from `getOutline`); (3) a new short label.
- **Person 1 matches** by `concept_key` first, then by the LLM's `matches_gap_id`; it stores `concept_key` on `insights` as well.
- No `concepts` table (keep the data model small).

## 8. Insights, analysis input/output, learner summary (snake_case)

> **The Insight, analysis input/output and learner-summary shapes below are superseded by §15** (implemented in `packages/contracts/src/insights.ts`, 2026-10-30). Kept for history.

```ts
type Insight = {
  id: number; student_id: number; session_id: number;
  kind: "gap" | "progress" | "suggestion";
  concept: string; concept_key: string;
  title: string; body: string;
  confidence?: number;                                  // gaps only, 0..1
  evidence: { event_id: number; quote: string }[];
  status: "new" | "accepted" | "dismissed" | "resolved";
  created_at: string; updated_at: string;
};

type LearnerSummary = {
  open_gaps: { concept: string; concept_key: string; description: string; confidence: number }[];   // top 5; dismissed excluded
  recent_progress: { concept: string; description: string }[];                                      // top 3
};
```

Analysis input (assembled by Person 1) and output (validated with Zod):

```json
{ "student_id": 3,
  "class_context": { "grade_level": "8º ano", "description": "..." },
  "material": { "title": "...", "subject": "História" },
  "counters": { "user_messages": 9, "hints_given": 2, "verifications": 3, "correct": 1, "independent_correct": 1 },
  "evidence": [ { "id": 41, "concept": "...", "concept_key": "...", "result": "incorrect", "independent": false, "hints_used": 2, "rationale": "..." } ],
  "turns": [ { "event_id": 101, "role": "student", "text": "..." }, { "event_id": 102, "role": "tutor", "text": "..." } ],
  "open_gaps": [ { "id": 7, "concept": "...", "concept_key": "..." } ] }
```

```json
{ "gaps": [ { "matches_gap_id": 7, "concept": "...", "description": "...", "confidence": 0.6,
              "evidence": [ { "event_id": 101, "quote": "..." } ] } ],
  "progress": [ { "concept": "...", "description": "...", "evidence": [ { "event_id": 118, "quote": "..." } ] } ],
  "suggestions": [ { "concept": "...", "title": "...", "body": "...", "rationale": "..." } ] }
```

`turns` are built from events: student turns from `user_message.text` and `verification_answered.answer`; tutor turns from `tutor_action` where `name = "speak"` (`args.text`) and `write_text` (plain text of `args.html`).

## 9. Repository interface (TypeScript sketch; fields in snake_case)

```ts
interface Repository {
  // Written/read by Person 3
  // subject: the clicked subject document, null = free whiteboard (searches all materials). D47, D54; code: packages/tutor/src/repository.ts
  createSession(i: { student_id: string; subject?: { id: string; name: string; key: string } | null; topic?: string; persona?: string; modality: "text" | "voice" }): Promise<{ id: string }>;
  appendEvent(session_id: number, e: { type: EventType; payload: unknown }): Promise<Event>;     // returns the stored event with its id
  listEvents(session_id: number, opts?: { after_id?: number }): Promise<Event[]>;
  finishSession(session_id: string, reason: SessionEndReason): Promise<"finished" | "already_finished" | "not_found">;
  resumeSession(session_id: string): Promise<"resumed" | "already_active" | "not_found">;
  insertEvidence(e: Omit<Evidence, "id">): Promise<{ id: number }>;
  getClassContext(): Promise<{ grade_level: "7º ano" | "8º ano" | "9º ano"; description: string }>;
  getLearnerSummary(student_id: number): Promise<LearnerSummary>;
  searchChunks(q: { query: string; k: number; material_ids?: string[]; material_id?: string; subject?: string }): Promise<Chunk[]>; // §13–14: the tutor passes the subject's material ids; none = all materials
  getPages(material_id: number, pages: number[]): Promise<Chunk[]>;
  getOutline(material_id: number) /* called per material of the subject */: Promise<{ title: string; start_page: number; end_page: number }[]>;
  validateCitation(c: Citation): Promise<boolean>;
  // Read by the whiteboard start screen (through the API)
  listStudents(): Promise<{ id: number; name: string }[]>;
  listMaterials(opts?: { ready_only?: boolean; subject_id?: string }): Promise<MaterialSummary[]>;
  listSubjects(): Promise<SubjectSummary[]>; // start-screen cards (D47): { id, name, key, material_count, materials }, see §14
  // Used by Person 1 (analysis and teacher UI)
  listInsights / upsertInsight / setInsightStatus / metrics ...   // internal to Person 1's packages
}
```

## 10. How we prove the two sides match (not just promise it)

1. **Fixtures with the real shapes** live in `fixtures/events/` (a conversation with a clear wrong answer and hints) and `fixtures/turns/` (turn scripts). `fixtures:check` validates all of them against the Zod schemas in CI.
2. **Round-trip contract test (the key one):** run Person 3's recorded fixture conversation through the **in-memory repository** and then through **Person 1's `buildAnalysisInput`**; assert it produces valid input, with `turns`, `evidence`, `counters` and `open_gaps` filled. Run in CI from kickoff.
3. **Analysis dry run on the same fixture:** the output must validate and every `quote` must occur in the cited event text.
4. **Seed uses the same shapes:** `scripts/seed.ts` inserts demo events/evidence/insights through the same schemas.
5. **Integration checkpoint H14** (`workstreams/README.md`): one real conversation → a gap with the student's own quote appears in the Students tab, with the same `concept_key` the tutor used.

## 11. Change rule

This file and `packages/contracts` change **together**, additively, after a message to the other two people. Never rename a field in place; add the new one, migrate, then remove the old one.

## 12. Additions of 2026-10-30 (voice-first back-end design)

Source of truth in code: `packages/contracts` (`actions.ts`, `stream.ts`, `events.ts`, `speech.ts`). Design: `docs/superpowers/specs/2026-10-30-whiteboard-backend-design.md`.

- **Turn stream** is a union tagged by `type`: `action`, `svg_chunk`, `speech_alignment`, `script_done`, `turn_done`, `error` (replaces the old `{order, action}` / `{done}` shape).
- **`speak` args** gain `audio_url` and `audio_format` (voice mode only).
- **`draw_result`** is an action (server → client) that carries `element_id` and `url`.
- **Student captions**: `SttCaption` is produced in the browser by `useStt()`; only `user_message.text` and `stt { provider, duration_ms, confidence? }` are sent and stored.
- **`TurnRequest`**: `appended` is a list of `user_message` or `verification_answer`; `interrupted` gains `spoken_ms`; optional `client_timing`.
- **Sessions** are created with `student_id` only (no `material_id`): the tutor searches all materials. `session_started` loses `material_id`; citations keep `material_id`.
- **Ids** are strings everywhere (MongoDB `_id`).

## 13. Retrieval additions of 2026-10-30

Source of truth in code: `packages/contracts/src/{retrieval,chunk-store}.ts`. Design: `docs/superpowers/specs/2026-10-30-whiteboard-backend-design.md` §6.1.

- `Repository.searchChunks({ query, k, material_id?, subject? }) → Chunk[]` replaces the old `searchChunks(material_id, query, k)`: the tutor searches **all** materials; `material_id` and `subject` are optional filters.
- `Chunk = { id, material_id, subject, chapter?, page, passage_idx, text, score? }` (a passage of ~400 tokens inside one page). `validateCitation(c)` is true when `c.quote` occurs on that page (whitespace- and case-insensitive).
- Ingestion (`@mento/sources/ingest`) stores passages with a 1024-dimension `embedding`; the catalog entry of each ready material is `{ material_id, title, subject, chapters: string[] }`.
- `createSession` no longer takes `material_id`, and `session_started` has no `material_id`.

## 14. Subjects (matérias), 2026-10-30

Source of truth in code: `packages/contracts/src/{subjects,sessions,retrieval,chunk-store,errors}.ts`. Front-end guide: `docs/frontend-integration.md`.

- **Subject** `{ id, name, key }` (`key` is a lowercase slug such as `history`; it also selects the tutor's subject profile). `SubjectSummary` adds `material_count` and `materials: [{ id, title, pages, status }]` (ready materials only).
- **Materials belong to a subject** (`materials.subject_id`); the ingestion script creates the subject from `--subject=<key>`.
- **Sessions:** `CreateSessionRequest.subject_id` is optional and nullable. With a subject, the tutor's catalog and every search are limited to that subject's materials (`SearchQuery.material_ids`); without one (free whiteboard), all materials are searched. `CreateSessionResponse` is `{ id, subject_id }`; `session_started` carries `subject_id` (or null).
- **Errors:** every error body is `ErrorResponse = { error, message? }`.
- Endpoints: `GET /api/subjects`, `GET /api/subjects/:id`, `POST /api/subjects`.

## 15. Teacher-side additions (implemented 2026-10-30, Person 1)

Source of truth in code: `packages/contracts/src/{student,class-context,material,session,session-events,evidence,insights,repository}.ts`. Additive to §2–§9 and to §12–§14 (the whiteboard back-end).

- **Ids** are opaque strings. Relations (`student_id`, `material_id`, …) are stored as strings, not `ObjectId`s, because sessions are not in MongoDB yet (D61). Lab fixtures use readable ids and map to database ids through `fixture_id`.
- **Events:** every event has `seq` (1-based, unique per session). `session_started` and `verification_asked` carry an optional `lesson_id` (a lesson of `material.sequence`).
- **Session:** `{ id, student_id, material_id, lesson_id | null, topic?, persona?, modality, status, started_at, ended_at?, end_reason?, is_simulated }`. `lesson_id` = the lesson the student is studying. **Person 3 must fill it** (and `evidence.lesson_id`) from `material.sequence`; without it the diagnosis is `null`.
- **Evidence:** `lesson_id | null` added (the lesson the question belongs to).
- **Material:** `sequence: Lesson[]` with `Lesson = { lesson_id, order, title, pages: [start, end], taught_in_class, summary, key_concepts[], activities[], prerequisites[] }`, plus `status` (`queued | processing | ready | failed`), `progress {done,total}`, `outline`, `pages_needing_ocr`, `file {key,size,sha256,mime}`, `fixture_id?`, `is_fixture`.
- **Student:** `{ fixture_id?, name, is_simulated, profile?, school_history[], current_term[] }` (fictional; never sent to an LLM).
- **Insight:** `{ id, student_id, session_id, analysis_id, kind: gap|progress|suggestion, severity: critical|medium|positive, rule, rules_version, concept, concept_key, title, body, confidence, evidence[{event_id, quote}], diagnosis: current_topic|prerequisite|outside_material|null, root_cause {lesson_id,title,pages,taught_in_class,reasoning}|null, studying_lesson_id, related_gap_id, material_ref, metrics, source: llm|template, status: new|accepted|dismissed|resolved, created_at, updated_at }`. A `suggestion` row hangs from its gap through `related_gap_id` and inherits its severity.
- **Analysis:** `{ id, session_id (unique), student_id, status: pending|running|done|failed, attempts, input_hash, rules_version, writer, prompt_version, skip_reason, studying_lesson_id, counters, findings[], summary, rejections[], insight_ids[], error, started_at, finished_at }`.
- **Rules `rules-v1`** (first match wins): P2_resolved, R3_recurring, R1_repeated_errors, M1_single_error, M2_needs_hints, P1_consistent, P3_first_success. Severity: `R*` critical, `M*` medium, `P*` positive. Findings exist only for concepts that appear in the analysed session; history includes only sessions up to it.
- **`getLearnerSummary(student_id)`** (for Person 3): top 5 open gaps (most severe first) and 3 recent progress items; concepts and descriptions only.
- **Teacher API** (all under `/api`): `GET /overview`, `GET|POST /students`, `GET /students/:id`, `GET /students/:id/{insights,evolution,sessions}`, `GET /insights`, `PATCH /insights/:id`, `GET|PUT /class-context`, `GET|POST /sessions/:id/analysis`, `POST /dev/analyze/:sessionId`, `GET /stream/teacher` (SSE), `GET|POST /materials`, `GET /materials/:id`, `GET /files/:id`. Details and examples: `/api/openapi.json`.
- **Hook for Person 3:** when a conversation ends call `container.sessionEnded.handle(session_id)` (runs the analysis, one retry after 30 s).
- **Name differences from the whiteboard contracts (§12–§14), kept on purpose so both coexist:** the typed event union read by the analysis is `SessionEvent` (the loose envelope used by the turn route stays `Event`); the API container exposes the teacher repository as `teacherRepo` and the upload store as `fileStore` (the turn repository stays `repo`).
- **Materials are one collection (D64).** `Material` (`packages/contracts/src/material.ts`) uses the whiteboard's names (`pages`, `chapters`, `subject` = the subject key, `subject_id`) plus optional upload fields: `status` also accepts `queued`; `file {key,size,sha256,mime}`; `progress {stage: queued|extracting|embedding|done, done, total}`; `sequence` (lessons); `pages_needing_ocr`; `toc_pages`; `passages` (count in `chunks`); `error`; `fixture_id`, `is_fixture` (lab material, never shown to the tutor). Materials ingested by `pnpm ingest` lack those fields and read with defaults. `ChunkStore.deletePassages?` removes a material's passages; `ingestPdf` accepts `material_id`, `pages` and `markReady`.
- **Upload:** `POST /api/materials` (multipart `subject_id` required, `title?`, `file`) → `202 {id, status, duplicate}`; `200` for a file already uploaded; `400` no subject or file, `404 subject_not_found`, `413`, `415`, `503 database_unavailable` / `embeddings_unavailable`.
- **The analysis reads the stored conversations (D65).** Stored shapes: `StoredSession` / `StoredEvent` / `StoredEvidence` and `ConversationReader` (`packages/contracts/src/stored-conversation.ts`), implemented by `MongoConversationReader` in @mento/db; `toSessionBundle` (@mento/analysis) maps them to `SessionBundle`: events get `seq` by stored order, evidence rows come from `evidences`. `Session.material_id` is nullable (a conversation that cited no source has none) and `session_started.payload.material_id` is optional. Material and lesson are derived from the sources the tutor cited: no change to the tutor\'s events. Helpers in `material.ts`: `lessonsFromChapters`, `sequenceOf(material)` (the saved sequence, or the chapters as lessons), `lessonOfPage`.
- **Trigger:** a real active → ended transition through `POST /api/sessions/:id/finish` (or the `/end` compatibility alias) starts `container.sessionEnded.handle(id)` in the background (waits for the judge, registered students only, one retry after 30 s). Duplicate finish calls do not trigger it. `ANALYSIS_MAX_WAIT_MS` (default 15000) bounds the wait; `CONVERSATIONS_FILE` switches the source to a JSON file for demos.
- **Resume and analysis identity:** `/resume` keeps the same session id and append-only history. `analyses.session_id` remains unique. A new finish with no new learning input is served from `input_hash` cache; new turns/evidence recompute the same analysis row and upsert the same open insights.

## 16. Exercise lists (2026-10-31, Person 1, D72)

Additive. Source of truth: `packages/contracts/src/exercises.ts`.

- `Exercise`: `{ id ("q1".."q5"), kind: "choice" | "open", prompt, options? (exactly 4, choice only), answer, explanation, page: number | null }`. `answer` and `explanation` only go to the teacher's PDF.
- `ExerciseList`: `{ id, title, concept, concept_key, material_id, material_title, lesson_id, lesson_title, pages: [from, to] | null, grade_level, gap_ids, student_count, status: "generating" | "ready" | "failed", error, exercises, model, prompt_version, created_at, updated_at }`.
- `CreateExerciseListBody`: `{ concept, gap_ids (1..100) }`.
- `ExerciseListStore`: `create`, `update`, `get`, `list` (newest first), `delete`.
- `TeacherEvent` gains `{ type: "exercise_list_status", list_id, status }`.
- Routes: `GET /api/exercise-lists`, `GET /api/exercise-lists/:id`, `POST /api/exercise-lists` (202 generating; 400 `invalid_gaps`; 503 `generator_unavailable` | `database_unavailable`), `DELETE /api/exercise-lists/:id` (204).


## 17. Structured diagrams: `draw_diagram` (2026-10-31, D75)

Additive. Source of truth: `packages/contracts/src/{diagram,actions}.ts`; resolver `packages/tutor/src/diagram/resolve.ts`; renderer `packages/board/src/renderers/diagram/`.

- **New action `draw_diagram`.** The model sends `DiagramBase` = `{ id, column, title (≤ 80), frame: "wide" | "square" | "tall", shapes (1..24) }`. Frames are grid presets (`wide` 160×100, `square` 100×100, `tall` 100×160; 100 on the short side, y down); the model never picks a viewBox.
- **Model shapes** (`DiagramShapeBase`, each with a snake_case `id`, plain-text labels ≤ 40 chars, `color?: ink | red | blue | green`): `rect { x?, y?, w, h, angle?, on?: { ref, segment?, t? }, label?, fill? }`, `line { from, to, dashed?, ground?, label? }`, `arrow { from: { ref, side? } | { at }, dir? (up | down | left | right | normal) | deg? | to?, magnitude? | length? (s | m | l), label? }`, `text { at, text, size? }`, `axes { x_range, y_range, x_ticks?, y_ticks?, x_label?, y_label? }`, `polyline { points (2..64), closed?, smooth?, fill?, label? }`, `point { at, label? }`. With an `axes` shape every `[x, y]` is in data units.
- **The server resolves it** (anchors → points, magnitudes → proportional lengths, labels past arrow tips and off boxes, uniform fit-to-frame, invalid shapes dropped, an empty diagram drops the action) into `DiagramArgs` = `{ id, column, title, frame, view: { w, h }, shapes }` with absolute geometry only: `rect { x, y, w, h, angle, fill, color, label? }`, `line`/`arrow { x1, y1, x2, y2, … }`, `text { x, y, text, size, color }`, `axes { x_axis, y_axis, ticks[], x_label?, y_label? }`, `polyline { points, closed, smooth, fill, color, label? }`, `point { x, y, color, label? }`; a label is `{ text, x, y (center), size }`. Only `DiagramArgs` is streamed, stored in `tutor_action` and replayed.
- **`highlight` and `circle_annotate` gain an optional `shape_id`** that targets one shape of a diagram (validated by the server). `circle_annotate.text_to_match` still works on a diagram's labels.
- **`draw.is_structured` is always `false`** (forced by the server, hidden from the model); `svg_chunk` stays unused.
- Fixtures: `fixtures/turns/newton-blocks.json` (a turn) and `fixtures/diagrams/examples.json` (model input → resolved output pairs, `pnpm diagrams:golden` regenerates the outputs); both checked by `pnpm fixtures:check`.
