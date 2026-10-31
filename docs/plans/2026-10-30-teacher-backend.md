# Teacher backend: execution plan (Person 1)

> Status: **executed 2026-10-30** (Phases 0–6; see "Execution report" at the end). Originally proposed 2026-10-30. Scope: **backend only** for the teacher side: data model, seed/dev loaders, conversation analysis → insights, teacher read APIs, material upload. Validated design: `fixtures/analysis-lab/` (rules, prompt, guardrails, expected outputs). Product spec: `docs/06`; pipeline: `workstreams/handoffs-and-insights-pipeline.md` §4; shapes: `workstreams/contracts-spec.md`.

## What is real and what is mocked

| Data | Now | Later |
|---|---|---|
| **Students** (profile, guardian, school history, current term) | **Mocked for good**: `pnpm seed` from `fixtures/seed/students.json` (fictional, `is_simulated`) | Same (no real student data in the hackathon) |
| Class context | `pnpm seed` | `PUT /api/class-context` |
| **Materials** | `pnpm seed:lab` inserts the lab material (`fixtures/analysis-lab/material.json`: metadata + lesson `sequence`), flagged `is_fixture`, **without chunks** (there is no PDF) | `POST /api/materials` (real PDF upload + ingestion, which creates the chunks), Phase 4 |
| **Conversations** (sessions, events, evidence) | **Not stored in MongoDB.** Read from `fixtures/analysis-lab/conversations.json` through a `ConversationSource` interface (`FileConversationSource`) | `MongoConversationSource`, written live by the whiteboard (Person 3) |
| Analyses and insights | **Never inserted by hand.** Produced by the real `AnalysisService` over the conversations and **stored in MongoDB** (`analyses`, `insights`) | Same, triggered by `session_ended` |

**Chunks.** A chunk is a piece of a material's extracted text (one per page, split when a page is long), stored as `{material_id, page, chunk_index, chapter, text, text_norm}` with a Portuguese text index. They exist for the **tutor**, not for the analysis: `searchChunks` finds the pages relevant to the student's question (books do not fit in the prompt), `getPages` loads them, and `validateCitation` checks that a cited `quote` really occurs on that page. Chunks are only created by the real PDF ingestion (Phase 4); the analysis uses `material.sequence`, never chunks.

## Principles

1. **Rules decide, the LLM explains.** Severity (`critical | medium | positive`) and the rule id come from `rules-v1` (deterministic). The **diagnosis is deterministic too** when evidence has a `lesson_id`: an evidence lesson earlier in the sequence than the lesson being studied ⇒ `prerequisite`, with `root_cause` = that lesson. The LLM writes the summary and the text, catches `outside_material`, and picks quotes. Template writer = fallback (and the only writer until an LLM key exists).
2. **Guardrails before writing** (from `check.ts`): severity/rule unchanged, confidence ≤ max, quotes verbatim in the cited student turn, no invented concept, every gap has a suggestion.
3. **Idempotent.** `analyses` keyed by `session_id`; `input_hash` = sha256(normalized input + `rules_version` + `prompt_version`) ⇒ same input reuses the stored result.
4. Routes stay thin: `routes/` (path + Zod) → `controllers/` → `services/` → `@mento/db` models (`apps/api` READMEs).

## Analysis spec (deterministic)

The analysis is a **pure function over stored data**. The only non-deterministic input is upstream: evidence `result` is decided during the session by Person 3's judge; once stored it is an immutable fact.

```
session_ended(session_id)
 1 load        from ConversationSource: session, events (by seq), evidence (by ts, id), earlier sessions of the student;
               from MongoDB: open insights, material.sequence
 2 input_hash  sha256(canonical JSON + rules_version + prompt_version); existing analysis with that hash → return it
 3 counters    pure aggregation per concept_key
 4 findings    ordered rules → severity
 5 diagnosis   prerequisite-graph search → root cause
 6 confidence  fixed formula
 7 text        template (always) | LLM (optional, rewrites text only)
 8 guardrails  drop invalid items; fall back to the template
 9 persist     analyses + insight upsert, in one transaction
```

**Counters (per `concept_key`, all sessions of the student):** `attempts`, `correct`, `partial`, `incorrect`, `independent_correct` (correct with `hints_used = 0`), `incorrect_sessions`, and the same numbers for the trigger session only (`last_*`).

**Rules `rules-v1` (first match wins):**

| # | Condition | Rule | Severity |
|---|---|---|---|
| 1 | incorrect in an earlier session, and in the trigger session ≥ 2 independent correct and 0 incorrect | P2 resolved | positive |
| 2 | incorrect ≥ 2 across different sessions | R3 recurring | critical |
| 3 | incorrect ≥ 2 in the same session | R1 | critical |
| 4 | incorrect = 1 or partial ≥ 1 | M1 | medium |
| 5 | correct only with hints | M2 | medium |
| 6 | independent_correct ≥ 2 | P1 | positive |
| 7 | independent_correct = 1 | P3 | positive |

Short session (< 2 student messages and no evidence) ⇒ no findings.

**Diagnosis.** `L*` = `session.lesson_id`; `E` = lessons of the concept's evidence (`evidence.lesson_id`); ancestors(`L*`) = BFS over `prerequisites`.
- `L* ∈ E` and no lesson of `E` earlier than `L*` ⇒ `current_topic`.
- Some `e ∈ E` in ancestors(`L*`) ⇒ `prerequisite`; root = the ancestor in `E` with the most incorrect + partial answers, tie → lowest `order`.
- Otherwise ⇒ `null`. Only then may the LLM set `outside_material`.

**Confidence.** `base = {R3: .8, R1: .7, M1: .4, M2: .4, P2: .8, P1: .7, P3: .4}[rule]`; `conf = min(base + 0.05 × (attempts − 1), attempts < 2 ? 0.5 : 0.9)`.

**Text.** Template per (rule, diagnosis) in pt-BR, filled with lesson titles, pages, activities and the latest quote. The LLM (temperature 0, Zod-validated) only returns `title`, `body`, `summary` and quote choices for findings that are already fixed. Temperature 0 is not bit-reproducible, so determinism comes from the `input_hash` cache; regeneration only with `force=true`.

**Guardrails** (drop the item when): severity/rule differs from the finding; `concept_key` not in the findings; confidence above the formula; a quote is not an exact substring of a **student** turn; a gap has no suggestion. Every finding becomes an insight (template text if needed); no insight exists without a finding.

**Persistence.** `analyses` unique by `session_id` (stores hash, versions, findings, output, `source`). Insight identity = `(student_id, kind, concept_key)` among **open** insights: update severity, confidence, `updated_at` and append evidence, else insert `status=new`. P2 sets the gap `resolved` and adds a progress insight. `dismissed` insights are never reopened or changed. At most one suggestion per open gap. Changing the logic means bumping `rules_version`.

**Lab check.** With this diagnosis rule, Carla's root cause is **L6** (her incorrect answer was on an L6 question), not L3 as in the hand-written lab output; `output/stu_03.json` is aligned when T2.3 lands.

## Phase 0: Foundation (contracts, models, DB)

**T0.1 DB config.** `baseSchemaOptions.timestamps` → `{ createdAt: "created_at", updatedAt: "updated_at" }` (snake_case rule). `connectMongo(uri, { dbName })` with `MONGODB_DB=mento` (the current Atlas URI has no db name and falls back to `test`). Add `MONGODB_DB` to `.env.example` and `apps/api/src/config.ts`.
*Done when:* `pnpm test` passes; `/api/health` shows `mongo: connected` on db `mento`.

**T0.2 Zod contracts** (`packages/contracts/src/`), additive to `contracts-spec.md`:
- `student.ts`: `Student { id, fixture_id?, name, is_simulated, profile{birth_date, enrollment_code, class_name, grade_level, guardian{name, relationship, phone, email}}, school_history[{year, grade_level, school_name, subjects[{subject, final_grade, attendance_pct, status}]}], current_term[{term, subject, grade, absences}] }`.
- `class-context.ts`, `material.ts` (`Material` with `status`, `progress`, `outline`, **`sequence[]`** = lessons `{lesson_id, order, title, pages, taught_in_class, summary, key_concepts, activities, prerequisites}`), `Chunk`.
- `session.ts` (`Session { id, student_id, material_id, lesson_id?, topic?, modality, status, started_at, ended_at?, end_reason?, is_simulated }`).
- `events.ts` / `evidence.ts` (spec §2–5, owned by Person 3; **written by Person 1 with their review**): envelope + `seq`; payload schema per type; `Evidence.lesson_id?`.
- `insights.ts`: `Insight` + `severity`, `rule`, `rules_version`, `diagnosis`, `root_cause`, `suggestion`, `source: "llm" | "template"`, `metrics`; `AnalysisInput`, `AnalysisOutput` (lab shapes), `LearnerSummary`.
*Done when:* `fixtures/analysis-lab/{conversations,inputs,output}` parse with these schemas (test `contracts/src/lab.test.ts`).

**T0.3 Mongoose models** (`packages/db/src/models/`): `student`, `class-context`, `material`, `chunk` (text index on `text_norm`, `default_language: "portuguese"`), `analysis` (unique `session_id`), `insight` (`{student_id, status, severity}`, `{student_id, concept_key, kind}`). **No `session`/`event`/`evidence` models now** (Person 3 adds them when the whiteboard writes conversations).
*Done when:* `syncIndexes()` runs clean against Atlas.

**T0.4 Repository** (`packages/db/src/repository/`): Mongo + in-memory, same interface: `listStudents`, `getStudent`, `upsertStudent`, `getMaterial`, `upsertMaterial`, `upsertAnalysis`, `getAnalysisBySession`, `listInsights(filter)`, `upsertInsight`, `setInsightStatus`, `overviewCounts`.
**T0.5 `ConversationSource`** (`packages/analysis/src/conversation-source.ts`): `listSessionsByStudent(student_id)`, `getSessionBundle(session_id)` (session + events + evidence), `listAllSessions()`. Implementation now: `FileConversationSource(path)` over `conversations.json`, mapping lab student ids (`stu_01`) to DB students by `fixture_id`. Later: `MongoConversationSource` (Person 3's collections), same interface.
*Done when:* one shared test suite passes on both repository implementations; the file source returns the 8 lab sessions.

## Phase 1: Data loading (scripts that write to the DB)

**T1.1 Students mock.** `fixtures/seed/students.json`: the 5 lab students (`fixture_id` `stu_01`…`stu_05`) + **Lucas** (live demo, no conversations). Each: complete fictional profile, school history for 6º and 7º ano (6 to 8 subjects), current term of 8º ano. `fixtures/seed/class-context.json`.
**`pnpm seed`** (`scripts/seed.ts`): upsert by `fixture_id`, class context singleton. `--reset` drops Person 1 collections first.
*Done when:* running twice leaves 6 students and 1 class context.

**T1.2 Lab loader.** **`pnpm seed:lab`** (`scripts/seed-lab.ts`):
1. Rebuild the lab (`fixtures/analysis-lab/build.ts`).
2. Upsert the material by `fixture_id = "mat_roma"` with `sequence`, `outline`, `status: "ready"`, `is_fixture: true`. No chunks.
3. **Conversations stay in the JSON file** (read by `FileConversationSource`); nothing about them is written to MongoDB.
4. `--analyze`: run `AnalysisService.run` for every lab session in chronological order (needs Phase 2); only `analyses` and `insights` are written.
Add `lesson_id` per conversation in `scripts.json` (Ana L6, Bruno L4, Carla L7, Diego L5, Eduarda null).
*Done when:* 1 material in the DB; re-running changes nothing; with `--analyze`, 8 analyses and the expected insights.

**T1.3 Inspect.** `pnpm db:stats` prints counts per collection (quick check for the team).

## Phase 2: Analysis engine (`packages/analysis`)

**T2.1 `buildAnalysisInput(conversations, repo, session_id)`**: counters, turns, evidence, history of earlier sessions of the same student, open gaps, material sequence, `concept_findings`. Port from `build.ts`. Test: input from the DB equals `inputs/stu_XX.json` (ignoring ids).
**T2.2 `rules.ts`** (`rules-v1`): R1, R3, M1, M2, P1, P2, P3 + short-session skip + confidence clamp. Table test: expected rule per concept from the lab (Ana R3/M1/P3, Bruno P2/P3, Carla M1/M2, Diego P3/M1/P3, Eduarda skip).
**T2.3 `diagnose.ts`**: deterministic `diagnosis` and `root_cause` from the lesson order and `prerequisites`; `studying_now` from `session.lesson_id`. Test: Ana → L2/L1 prerequisite, Carla → L3 prerequisite.
**T2.4 `writer-template.ts`**: pt-BR templates per rule/diagnosis (title, body, suggestion pointing to activities and pages from the sequence). Deterministic: same input ⇒ same text.
**T2.5 `guardrails.ts`**: port `check.ts` as `validateAnalysisOutput(input, output)`; invalid items are dropped, never "fixed" by the LLM again.
**T2.6 `writer-llm.ts`**: interface `AnalysisWriter`; prompt moved to `prompts/analysis.md` (from `analysis-prompt.md`); temperature 0, structured output; provider chosen in Q4 (`LLM_API_KEY`, `LLM_MODEL_ANALYSIS`). Without a key ⇒ template writer. Test with a **recorded response** = `fixtures/analysis-lab/output/*.json`.
**T2.7 `persist.ts`**: write `analyses` (status, `input_hash`, versions, findings, output, error); upsert `insights` (match by `concept_key` among open gaps, append evidence, `P2` ⇒ gap `resolved`, one suggestion per gap, never touch `dismissed`).
**T2.8 `AnalysisService.run(session_id, { force?, writer? })`** + `SessionEndedHandler` (in-process, async, 1 retry after 30 s) + publishes `insight_created` on the EventBus.
*Done when:* `pnpm seed:lab --analyze` produces, for every student, insights with the lab severities and diagnoses, and the guardrails pass.

## Phase 3: Teacher API (`apps/api`)

| Task | Route | Notes |
|---|---|---|
| T3.1 | `POST /api/sessions/:id/analysis?force=` → `202`; `GET /api/sessions/:id/analysis`; `POST /api/dev/analyze/:id` alias | Trigger and status |
| T3.2 | `GET /api/students` | name, class, conversations, last activity, counts by severity, `is_simulated` |
| T3.3 | `GET /api/students/:id` | profile, school history, current term, latest analysis `summary` + `studying_now` |
| T3.4 | `GET /api/students/:id/insights?severity=&status=` | the per-student insights table, grouped by severity |
| T3.5 | `GET /api/students/:id/evolution`, `GET /api/students/:id/sessions` | evidence per concept per session with `n`; "insufficient" when n < 3 |
| T3.6 | `GET /api/insights?severity=&status=` | class-wide insights section (critical / medium / positive) |
| T3.7 | `PATCH /api/insights/:id` | `accepted` / `dismissed` |
| T3.8 | `GET /api/overview`, `GET/PUT /api/class-context`, `POST /api/students` | metrics by severity |
| T3.9 | `GET /api/stream/teacher` (SSE) | `insight_created`, `analysis_status`, `material_status` |
| T3.10 | `getLearnerSummary(student_id)` | for Person 3: top 5 open gaps by severity + 3 progress; no profile, no name |

*Done when:* route tests with `app.inject` against the in-memory repository; OpenAPI at `/api/openapi.json` lists them.

## Phase 4: Material upload (real)

**T4.1** `FileStore` (disk, `data/uploads/`, git-ignored) + `POST /api/materials` (multipart: `file`, `title?`, `subject`): `%PDF` magic bytes, sha256 dedupe, `202 {id, status: "queued"}`.
**T4.2** In-process job queue (concurrency 1, re-queue `processing` on boot): per-page text (`unpdf`), `pages_needing_ocr` (< 50 chars), normalized chunks, PDF outline (fallback: heading heuristics), progress updates + `material_status` SSE.
**T4.3 Lesson sequence extraction**: one LLM call over the outline + first page of each chapter ⇒ `sequence` (summary, key concepts, activities, prerequisites). Fallback without LLM: outline order, `prerequisites = [previous lesson]`. Shape = `material.json`.
**T4.4** `GET /api/materials`, `GET /api/materials/:id`, `GET /api/files/:id` (range requests for pdf.js); `searchChunks`, `getPages`, `getOutline`, `validateCitation` for Person 3.
*Done when:* uploading a real book PDF ends `ready` with chunks and a sequence; the lab material can be replaced by it.

## Phase 5: Integration and docs

- **T5.1** End to end: `pnpm seed --reset && pnpm seed:lab --analyze` → teacher APIs return the lab picture (Ana critical L2 prerequisite, Bruno resolved, etc.).
- **T5.2** Contract round-trip test with Person 3's recorded conversation (spec §10).
- **T5.3** Docs: `contracts-spec.md` (seq, sessions, `lesson_id`, insight fields, `material.sequence`), `docs/10-decisions.md` (D57 mocked student profile/school history; D58 severity by rules; D59 deterministic diagnosis by lesson order; D60 material sequence), `docs/06`, `docs/07`.

## Phase 6: Business-rule test battery

Every business rule has an id (`BR-xx`) and at least one test that names it (`it("BR-03 …")`). Runner: Vitest. `pnpm test:rules` runs the whole battery and prints a table rule → tests → pass/fail (the report used at each gate).

### Test levels

| Level | Where | Data | Speed |
|---|---|---|---|
| **Unit** | `packages/analysis/src/**/*.test.ts`, `packages/sources` | Inline mini-fixtures (one concept, a few evidence rows) | < 2 s, every save |
| **Golden** | `packages/analysis/test/golden.test.ts` | The 8 lab conversations → expected insights per student (`fixtures/analysis-lab/expected/`) | < 5 s |
| **API** | `apps/api/src/routes/*.test.ts` with `app.inject` | In-memory repository + `FileConversationSource` | < 10 s |
| **Integration** | `packages/db/test/*.int.test.ts` | Real MongoDB, database `mento_test` (dropped before and after) | ~30 s |
| **End to end** | `scripts/e2e-teacher.ts` | `seed --reset` → `seed:lab --analyze` → HTTP calls on a running API | ~1 min |

### Battery

| Id | Business rule | Cases (expected result) | Level |
|---|---|---|---|
| BR-01 | Severity rules R1, R3, M1, M2, P1, P2, P3 | One case per rule at the boundary: incorrect = 2 same session → R1 critical; incorrect 1 + 1 in another session → R3 critical; incorrect = 1 → M1 medium; partial = 1 → M1; correct only with hints → M2; 2 independent correct → P1; 1 → P3; earlier incorrect + 2 independent correct now → P2 | Unit |
| BR-02 | Rule precedence (first match wins) | Earlier incorrect + now 2 independent correct and 0 incorrect → P2, not R3; incorrect = 2 and independent = 2 → R1 | Unit |
| BR-03 | Short session generates nothing | 1 student message, no evidence → 0 findings, analysis `done` with `skip_reason`; 1 message + 1 evidence → analyzed | Unit |
| BR-04 | Confidence formula and clamp | attempts = 1 → ≤ 0.5 for every rule; R3 with 3 attempts → 0.9 cap; values exactly as the formula | Unit |
| BR-05 | Diagnosis by prerequisite graph | Same lesson → `current_topic`; direct prerequisite → `prerequisite` + that lesson; transitive (L1 via L2) → L1; two ancestors, tie → lower `order`; no `lesson_id` → `null` | Unit |
| BR-06 | LLM cannot change the verdict | LLM output with other severity / rule / invented concept / confidence above formula → item dropped, template used | Unit |
| BR-07 | Quotes are real | Quote not a substring of the turn → dropped; quote from a tutor turn → dropped; exact student substring → kept | Unit |
| BR-08 | Every gap has a suggestion; every finding becomes an insight | Gap without suggestion → template suggestion; LLM omits a finding → template insight created | Unit |
| BR-09 | Determinism | Same input twice → identical `input_hash` and byte-identical output (template); second run makes 0 LLM calls; `force=true` re-runs; bumping `rules_version` changes the hash | Unit + Integration |
| BR-10 | Gap upsert without duplicates | Same `concept_key` in two sessions → 1 gap, evidence appended, `updated_at` changes; different concept → new gap | Unit + Integration |
| BR-11 | Resolution | P2 → gap `resolved` + a `progress` insight; resolved gaps leave the open counts | Unit + Integration |
| BR-12 | Teacher decision is final | `dismissed` gap is never reopened or edited by later analyses; it leaves overview counts and the learner summary | Integration + API |
| BR-13 | One suggestion per open gap | Re-analysis does not create a second suggestion while the first is `new`/`accepted` | Integration |
| BR-14 | Privacy | Analysis input and LLM payload contain no student name and no `profile`/`school_history`; `getLearnerSummary` returns concepts only | Unit + API |
| BR-15 | No sensitive inferences | Template texts and LLM outputs rejected if they contain words from a blocklist (ansioso, preguiçoso, desatento, inteligente, estilo de aprendizagem…) | Unit |
| BR-16 | Analysis lifecycle | Trigger → `pending → running → done`; thrown error → `failed` + `error` stored + 1 retry after 30 s; `GET /sessions/:id/analysis` reflects it | Unit (fake timers) + API |
| BR-17 | Golden scenario | Ana: Formas de governo critical R3, prerequisite L2; Cidadania medium, L1; Crise da República positive. Bruno: P2 resolved + P3. Carla: Cronologia medium, prerequisite L6; Pão e circo medium M2 current_topic. Diego: Geografia medium, `null` (LLM may set outside_material); 2 × P3. Eduarda: none | Golden |
| BR-18 | Overview metrics | Counts by severity equal a recount from `insights`; dismissed excluded from "open gaps"; simulated students counted separately | API |
| BR-19 | Student views | `GET /students/:id` returns profile + school history; `/insights?severity=critical` filters; `/evolution` marks n < 3 as insufficient | API |
| BR-20 | Seeds are idempotent | `seed` and `seed:lab` twice → same counts; `--reset` touches only Person 1 collections | Integration |
| BR-21 | Material upload validation | Non-PDF (bad magic bytes) → 415; > limit → 413; same file twice → same material id (sha256); valid → 202 `queued` | API |
| BR-22 | Ingestion status | `queued → processing (progress n/N) → ready`; corrupt PDF → `failed` with error; restart during `processing` → re-queued | Integration |
| BR-23 | Chunks and citations | Page text split into chunks with the right `page`; Portuguese search "fim da república" finds the right page; `validateCitation` accepts the quote with different accents/spaces and rejects an invented one | Integration |
| BR-24 | Lesson sequence | Extracted `sequence` validates against the schema; without LLM: outline order and `prerequisites = [previous]` | Unit |

### Test agenda

| When | What runs | Gate (must pass to continue) |
|---|---|---|
| During each task (TDD) | Unit tests of the task's BR ids, written before the code | Task is done only with its tests green |
| End of Phase 0 | Repository suite (memory + Mongo `mento_test`), contracts parse the lab files | Phase 1 starts |
| End of Phase 1 | BR-20 | Phase 2 starts |
| Middle of Phase 2 (after T2.5) | BR-01 … BR-08, BR-14, BR-15 | LLM writer work starts |
| End of Phase 2 | BR-09 … BR-13, BR-16, **BR-17 golden** | Phase 3 starts |
| End of Phase 3 | BR-12, BR-14, BR-16, BR-18, BR-19 (API) | Integration with the teacher UI |
| End of Phase 4 | BR-21 … BR-24 (with a real book PDF) | Lab material can be replaced |
| Every push (CI) | Unit + golden + API + `fixtures:check` | Merge to `main` |
| Before the demo (H22) | `pnpm test:rules` full, `scripts/e2e-teacher.ts`, and a manual checklist: open the 5 students, dismiss one insight, re-run one analysis with `force`, upload the book | Code freeze |

## Order and estimates

| Phase | Est. | Depends on |
|---|---|---|
| 0 Foundation | 3 h | — |
| 1 Data loading | 1.5 h | 0 |
| 2 Analysis engine | 5 h | 0, 1 |
| 3 Teacher API | 4 h | 0 (2 for insights) |
| 4 Material upload | 5 h | 0 |
| 5 Integration | 1.5 h | all |
| 6 Test battery (tests are written inside each phase; this is the report, golden, e2e and checklist) | 2 h | all |

Phases 3 and 4 can run in parallel after Phase 2 starts.

## Open items

1. **LLM provider for analysis** (Q4): no key in `.env` yet; the template writer covers the gap.
2. **`session.lesson_id` / `evidence.lesson_id`** must come from Person 3 (tutor maps the topic and verifications to a lesson of the sequence). Without them, the diagnosis falls back to the LLM.
3. Person 3 review of the event/evidence/session Zod written in T0.2.
4. Writing to the shared Atlas cluster: the seed `--reset` must only drop Person 1 collections, or use a separate `MONGODB_DB` per developer.

## Execution report (2026-10-30)

All phases were implemented and verified: `pnpm test:rules` reports **24 of 24 business rules green** (~165 tests, including MongoDB integration on throwaway `mento_test_*` databases, a real generated PDF, and the HTTP API), and `pnpm e2e:teacher` passes against Atlas. `pnpm typecheck` and `pnpm lint` are clean. `pnpm seed && pnpm seed:lab --analyze` was run on database `mento` (6 students, 1 material, 8 analyses, 17 insights, 0 chunks) and repeated with identical counts (BR-20).

**Deviations from the plan, and why**

| Plan | Built | Reason |
|---|---|---|
| Persist in one transaction | Idempotent upserts; the analysis row is set `done` last | Memory repository has no transactions; a crash mid-way leaves `running`/`failed` and a re-run converges |
| Relations stored as `ObjectId` | Stored as strings | Sessions are not in MongoDB yet (D61); ids are opaque in the contracts |
| LLM could set `outside_material` only when the diagnosis is `null` | Also over `current_topic` (never over `prerequisite`) | A difficulty inside the studied lesson can still be a skill the material never teaches (Diego and the map) |
| Rule R3 "recurring" counted incorrect answers | Counts **sessions** with an incorrect answer (`incorrect_sessions ≥ 2`); `incorrect ≥ 2` in one session is R1 | Matches the severity table |
| Prerequisite root = ancestor with most wrong answers | Wrong answers first, then hint-assisted correct ones, then lowest order; a strong ancestor answer is not a cause | A test showed correct, unaided answers in an earlier lesson were counted as weak |
| `open_gaps` in the analysis input | Removed | It made the input depend on the analysis's own output and broke the hash cache |
| Concurrency not specified | One queue per session; each `start` is one unit (mark + run) | Found by the end-to-end check: a normal and a forced request recomputed twice |
| Empty JSON bodies | Accepted as "no body" | `fetch` wrappers send `Content-Type: application/json` on body-less POSTs |
| Integration DB `mento_test` | One database per package (`mento_test_db`, `_sources`, `_analysis`) | Parallel suites dropped each other's database |
| LLM provider | Interface + `LlmWriter` with an injected `complete()`; **not wired to a provider** | Q4 is still open and there is no key; the template writer runs everything |

**Still open (not code):** the LLM provider (Q4); Person 3 filling `session.lesson_id` and `evidence.lesson_id` from `material.sequence`, and calling `container.sessionEnded.handle(id)` from `POST /sessions/:id/end`; Person 3 reviewing the event, evidence and session schemas in `packages/contracts`; the teacher screens (frontend) on top of this API.

## Update 2026-10-31: upload linked to a subject, with embeddings (D64)

After the rebase the teacher upload kept its own `teachermaterials` / `teacherchunks`. It now feeds the whiteboard's flow: the upload requires a `subject_id`, and the job runs the whiteboard's `ingestPdf` (Voyage embeddings into `chunks`), then saves chapters and lesson sequence and marks the material `ready`. One `materials` and one `chunks` collection remain; the database is the one named in `MONGODB_URI` (the same `pnpm ingest` writes to). Verified on Atlas with the real tutor citing an uploaded PDF. The "database `mento`" and "`teachermaterials`" mentions above are historical.
