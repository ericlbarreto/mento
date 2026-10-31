# Teacher-side data integration (materials, conversations, evidence → insights)

> For Person 1 (teacher interface + data + insights). Written by the whiteboard back-end (Person 3), 2026-10-30.
> Code is the source of truth: shapes come from `@mento/contracts`, the tutor's storage interfaces from `packages/tutor/src/repository.ts` and `packages/tutor/src/judge/evidence.ts`. The whiteboard API is described in `docs/frontend-integration.md`; the canonical shapes in `workstreams/contracts-spec.md` (§3 events, §5 evidence, §8 insights, §13–14 retrieval and subjects).

## 0. What is stored where today (read this first)

| Data | Where it lives now | Can the teacher side read it? |
|---|---|---|
| Subjects (matérias) | MongoDB, collection `subjects` | Yes |
| Materials (books) | MongoDB, collection `materials` | Yes |
| Passages + embeddings | MongoDB, collection `chunks` (Atlas Vector Search + Atlas Search indexes) | Yes (normally not needed) |
| **Sessions** | **In memory** in the API process (`InMemoryTurnRepository`) | **No**: lost on restart, not in the database |
| **Conversation events** (messages, tutor actions, questions, hints, answers, timings) | **In memory** (same repository) | **No** |
| **Evidence** (judged answers) | **In memory** (`InMemoryEvidenceStore`) | **No** |
| Class context, learner summary | Not implemented (the in-memory repository returns defaults: `8º ano`, no gaps) | — |

The tutor only talks to storage through two small interfaces (§4). **To get conversations into MongoDB, implement those two interfaces with Mongoose and plug them into `apps/api/src/container.ts`.** Nothing in the tutor changes. Until that lands, the shapes below are exactly what you will receive.

## 1. Subjects and materials (MongoDB)

### `subjects`

```ts
{ _id: ObjectId, name: string /* "História" */, key: string /* "history", unique */, createdAt: Date, updatedAt: Date }
```

### `materials`

```ts
{
  _id: ObjectId,
  title: string,                       // "História de Roma Antiga I (Coimbra, 2015)"
  subject: string,                     // the subject key, e.g. "history"
  subject_id?: string,                 // String(subjects._id)
  chapters: { title: string; start_page: number; end_page: number }[],   // may be empty
  pages: number,
  status: "processing" | "ready" | "failed",
  createdAt: Date, updatedAt: Date,
}
```

Only `status: "ready"` materials are listed to students and searched by the tutor.

### `chunks` (passages of a material)

```ts
{ _id, material_id: string, subject: string, chapter?: string, page: number, passage_idx: number,
  text: string /* ~1,600 chars inside one page */, embedding: number[] /* 1024, not selected by default */, createdAt, updatedAt }
```

### Code you can reuse (all exported)

| Need | Use |
|---|---|
| Models | `SubjectModel`, `MaterialModel`, `ChunkModel` from `@mento/db` |
| Subjects with their ready materials and counts | `new MongoSubjectStore().list()` / `.get(id)` / `.create({ name, key })` / `.upsertByKey(key, name)` (`@mento/db`) → `SubjectSummary` |
| Catalog of ready materials (optionally one subject) | `new MongoChunkStore().listCatalog(subject_id?)` (`@mento/db`) → `CatalogRecord[]` |
| Upload a PDF (ingestion) | `ingestPdf({ data, title, subject, subject_id, chapters?, store: new MongoChunkStore(), embed: embedWithVoyage({ apiKey }) })` from `@mento/sources/ingest` + `@mento/sources` → `{ material_id, pages, passages, empty_pages, toc_pages }` |
| Replace an earlier upload of the same title | `deleteMaterialsByTitle(title)` (`@mento/db`) |
| Create the search indexes once | `ensureChunkIndexes()` (`@mento/db`, idempotent) |
| Command line | `pnpm ingest <file.pdf> --title="…" --subject=history [--subject-name="História"] [--chapters="A República:1-40;O Império:41-90"] [--replace]` |

### Endpoints that exist

`GET /api/subjects` (each subject with `material_count` and `materials: [{ id, title, pages, status }]`), `GET /api/subjects/:id`, `POST /api/subjects { name, key }`. Details in `docs/frontend-integration.md` §2.

### Endpoints still to build (Person 1's route files, currently empty stubs)

- `GET /api/materials?subject_id=` → list for the Materials tab (suggestion: all statuses, so the teacher sees `processing` and `failed` too). `MaterialModel.find(...)` is enough.
- `POST /api/materials` (multipart: `file`, `title`, `subject_id`) → run `ingestPdf` in the background (it takes ~30 s for a 500-page book; most of it is embeddings), answer `202 { id }` once the material document exists, and let the UI poll `status`. Ingestion needs `VOYAGE_API_KEY` and MongoDB Atlas.

## 2. Conversations: sessions and events

### Session

Created by `POST /api/sessions` (`docs/frontend-integration.md` §3) through `TurnRepository.createSession`:

```ts
interface SessionInfo {
  id: string;
  student_id: string;
  modality: "text" | "voice";
  subject: { id: string; name: string; key: string } | null;   // null = free whiteboard
}
```

### Event envelope (`Event` in `@mento/contracts`)

```ts
{ id: string, session_id: string, ts: string /* ISO 8601 UTC */, type: EventType, payload: unknown }
```

Events are appended **in conversation order** (the tutor writes them through an ordered queue). Ids must sort in insertion order if you rely on them for ordering (ObjectIds do).

### Every event the whiteboard writes today, with its exact payload

| `type` | Written when | `payload` |
|---|---|---|
| `session_started` | Session created | `{ student_id, modality, topic?, subject_id: string \| null }` |
| `user_message` | Student spoke, typed, clicked or quick action | `{ kind: "chat" \| "speech" \| "board_select" \| "quick_action", text, selected?: { element_id, text? }, stt?: { provider, duration_ms, confidence? } }` |
| `tutor_action` | Each action the tutor emitted (after validation) | `{ turn_id, action_id, order, name, args }`; `name` is one of the actions in `docs/frontend-integration.md` §5 and `args` its arguments (e.g. `speak.args.text`, `write_text.args.html`, `sources`) |
| `verification_asked` | Tutor asked a check question | `{ verification_id, element_id, concept, concept_key, question, kind: "explain" \| "transfer" \| "place_on_timeline" }` |
| `hint_given` | Tutor gave a hint (`speak`/`write_text` with `purpose: "hint"`) | `{ turn_id, level: 1 \| 2 \| 3, verification_id?, concept_key? }` (`verification_id` is set when a question was open) |
| `verification_answered` | Student answered a question | `{ verification_id, element_id, answer }` |
| `evidence_recorded` | The judge finished (background, a few seconds later) | `{ evidence_id, verification_id, concept, concept_key, result, independent, hints_used, rationale, citation? }` |
| `interrupted` | Student cut the tutor off | `{ turn_id, action_id? }` |
| `turn_timing` | End of each tutor turn | `{ turn_id, context_ready_ms?, llm_first_token_ms?, first_action_ms?, tts_first_byte_ms?, script_done_ms?, image_ready_ms? }` (monitoring only) |
| `session_ended` | `POST /api/sessions/:id/end` | `{ reason: "user_left" \| "idle_timeout" \| "beacon" \| "manual" }` |

`mic_state` exists in the `EventType` list but is not written yet. Student names never appear in events.

### A typical sequence

```
session_started
tutor_action (speak "Oi! …") · tutor_action (write_text title) · turn_timing
user_message (speech "Quero estudar os irmãos Graco")
tutor_action (speak …, sources [{ material_id, page: 328, quote }]) · tutor_action (write_text …) · tutor_action (draw …)
tutor_action (ask_verification …) · verification_asked { verification_id: "ver_1", concept: "Revolta dos Gracos", concept_key: "revolta dos gracos", … } · turn_timing
verification_answered { verification_id: "ver_1", answer: "Porque ele queria dividir as terras…" }
tutor_action (speak "Isso mesmo! …") … · turn_timing
evidence_recorded { result: "correct", independent: true, hints_used: 0, concept_key: "revolta dos gracos", … }
…
session_ended { reason: "user_left" }
```

## 3. Evidence (the judged answers)

Written by the judge (`claude-haiku-5-5`) after every `verification_answer`, through `EvidenceStore.insertEvidence`:

```ts
interface EvidenceInput {
  session_id: string;
  student_id: string;
  concept: string;          // pt-BR label, ≤ 60 chars (reuses open-gap labels, then chapter titles)
  concept_key: string;      // normalizeConcept(concept): lowercase, no accents, single spaces
  result: "correct" | "partial" | "incorrect";
  independent: boolean;     // true when no hint was given for that question
  hints_used: number;       // hint_given events with this verification_id between the question and the answer
  rationale: string;        // one or two sentences, pt-BR, about the answer only
  citation?: { material_id: string; page: number; quote: string };   // validated against the book page
}
```

The same data is also appended as the `evidence_recorded` event (with `evidence_id`). Match concepts across sessions with `concept_key` (`normalizeConcept` from `@mento/contracts`).

## 4. The two interfaces to implement with MongoDB

### `TurnRepository` (`packages/tutor/src/repository.ts`)

```ts
interface TurnRepository {
  createSession(input: { student_id: string; modality: "text" | "voice"; topic?: string; subject?: { id: string; name: string; key: string } | null }): Promise<{ id: string }>;
  getSession(session_id: string): Promise<SessionInfo | null>;
  appendEvent(session_id: string, event: { type: EventType; payload: unknown }): Promise<Event>;
  listEvents(session_id: string): Promise<Event[]>;                 // in insertion order
  endSession(session_id: string, reason: string): Promise<void>;    // append session_ended (your analysis trigger)
  getClassContext(): Promise<{ grade_level: string; description: string }>;
  getLearnerSummary(student_id: string): Promise<{
    open_gaps: { concept: string; concept_key: string; description: string; confidence: number }[];   // top 5, dismissed excluded
    recent_progress: { concept: string; description: string }[];                                      // top 3
  }>;
  getCatalog(subject_id?: string): Promise<CatalogEntry[]>;         // delegate to MongoChunkStore.listCatalog(subject_id)
}
```

Notes:
- `createSession` must append `session_started` with the payload above (see `InMemoryTurnRepository` in `packages/tutor/src/testing/memory-repository.ts`: it is the reference implementation, about 60 lines).
- `getLearnerSummary` closes the loop: the open gaps you compute are injected into the tutor's prompt in the student's next session, and the tutor reuses their labels in new questions.
- `getClassContext` feeds the grade level and the teacher's class description to every conversation.
- `endSession` is the place to start your analysis (in process, asynchronously).

### `EvidenceStore` (`packages/tutor/src/judge/evidence.ts`)

```ts
interface EvidenceStore { insertEvidence(e: EvidenceInput): Promise<{ id: string }>; }
```

### Wiring (one file)

In `apps/api/src/container.ts`, `createContainer` builds `repo` (today `withCatalog(new InMemoryTurnRepository(...), …)`) and `evidence` (today `new InMemoryEvidenceStore()`). Replace them with your Mongo implementations; tests already inject fakes through `buildApp(config, { repo, evidence })`, so the routes need no change.

Suggested collections (a proposal, yours to decide): `sessions` (`student_id`, `modality`, `subject_id`, `started_at`, `ended_at`, `end_reason`), `events` (`session_id` indexed, `ts`, `type`, `payload`), `evidence` (fields of §3 + `ts`), and your own `analyses` / `insights` / `students` / `class_context`.

## 5. From events and evidence to insights

What the analysis needs is defined in `workstreams/contracts-spec.md` §8; how to get it from the data above:

| Analysis input | Source |
|---|---|
| `turns` (student) | `user_message.payload.text`, `verification_answered.payload.answer` (keep the event `id` for evidence quotes) |
| `turns` (tutor) | `tutor_action` with `name: "speak"` → `args.text`; `name: "write_text"` → plain text of `args.html` (`historyFromEvents` in `@mento/tutor` already builds the student/tutor transcript) |
| `counters` | count `user_message`, `hint_given`, `verification_asked`, and `evidence` rows with `result: "correct"` and with `independent: true` |
| `evidence` | the session's evidence rows (or `evidence_recorded` payloads) |
| `material` / subject | `session_started.payload.subject_id` → `subjects`; cited pages come from `sources` in `tutor_action.args` and `evidence.citation` |
| `open_gaps` | your `insights` with `kind: "gap"` and status `new`/`accepted` for the student |

Rules that still apply (`workstreams/handoffs-and-insights-pipeline.md` §4.5): every insight quote must occur in the cited event text; with fewer than 2 evidence items for a concept, cap gap confidence at 0.5; no personality, attention or emotion inferences; no student name in anything sent to an LLM.

## 6. How to generate real data to test with

1. `pnpm dev`, open `http://localhost:3000/dev/conversation`, pick História, choose **texto**, start, ask a question, answer the question the tutor puts on the board (that produces `verification_asked`, `verification_answered` and, a few seconds later, `evidence_recorded`), then click **Encerrar** (`session_ended`).
2. Until the Mongo repository exists, these events live only in the API process. A quick way to look at them while developing is to add a dev route that returns `repo.listEvents(id)` (the route file `routes/sessions.ts` already handles sessions).
3. Fixture alternative without the LLM: `fixtures/turns/*.json` shows the turn stream; the event shapes are in §2.
