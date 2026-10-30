# Person 1 — Teacher interface, data and insights

> Status: proposed plan, 2026-10-30. Product spec: `docs/06-teacher-interface.md`. Seams with the others: `handoffs-and-insights-pipeline.md`. Visual language: `docs/18-ui-references.md` and `docs/19-brand-assets.md`.

## Mission

Give the teacher a **simple, beautiful, single workspace** (no login) with two tabs, **Alunos** and **Materiais**, and make the **whiteboard conversations turn into insights** the teacher can act on. You also own the **database**, the **materials pipeline** and the **analysis job**, because those feed your screens.

## You own (paths)

`apps/web/src/app/(teacher)/**` · API route files in `apps/api/src/routes/`: `students.ts`, `sessions.ts`, `overview.ts`, `class-context.ts`, `insights.ts`, `materials.ts`, `files.ts`, `teacher-stream.ts`, `dev-analyze.ts` (the Fastify API service, `docs/21-repo-structure.md`) · `packages/db/**` · `packages/sources/**` · `packages/analysis/**` · `scripts/seed.ts` · `scripts/ingest.ts` · `apps/web/src/app/api/dev/analyze/**`.

## You produce / consume

| You produce | Consumed by |
|---|---|
| `Repository` (in-memory at kickoff, SQLite by hour ≤ 3) | Person 3 (events, evidence, context, search) |
| `getLearnerSummary`, `getClassContext`, `searchChunks`, `getPages`, `getOutline`, `validateCitation` | Person 3 |
| Student list and material list APIs | Person 2 (start screen) |
| Insights (rows) | Your own teacher UI and the learner summary |
| **You consume** | From |
| Events, evidence, `session_ended` | Person 3 |
| Tokens and components (`packages/ui`) | Person 2 |

## Day-0 checks (≤ 1.5 h, in parallel after kickoff)

1. **Ingest a real book PDF** (the demo candidate): time and cost of text-layer extraction, and how many pages need the vision path; does the PDF have a text layer?
2. **SQLite FTS** over page chunks: does a Portuguese query ("fim da República") return the right pages? (accents, stemming, ranking).
3. **Analysis dry run:** feed the **fixture event log** to a structured LLM call and check the JSON validates (shapes in `contracts-spec.md` §8; pipeline in `handoffs-and-insights-pipeline.md` §4).

## Screens (build order)

### 1. Students tab ("Alunos") — the heart of the demo
- **Overview metrics** (4 cards): Students, Conversations, Gaps identified, Insights generated (`GET /api/overview`; SQL in `handoffs-and-insights-pipeline.md` §4.6). Refresh via the **teacher live feed** (`GET /api/stream/teacher`, SSE: `insight_created`, `session_ended`, `material_status`) with a 5 s polling fallback, so a new insight appears during the demo.
- **Class context card** (`GET/PUT /api/class-context`): grade level (7º/8º/9º ano) + description textarea (hint with a pt-BR example; warn not to include personal data). Seeded until the form is done.
- **Student table:** name, conversations, last activity, open gaps, "simulated" badge. **Create student** button (name only).
- **Student detail:**
  - **Evolução** per concept (rows with a small sparkline of correct/independent per conversation, `n` shown; "evidência insuficiente" when n < 3).
  - **Lacunas** (cards: concept, description, confidence label, the **student's own words** as a quote, link to the conversation moment).
  - **Sugestões** (card with **Aceitar / Descartar**; only registers the decision).
  - **Progresso** and **Conversas** (read-only replay is nice-to-have).
- **States to design:** loading skeletons, empty ("ainda sem conversas"), error, "new" markers, simulated badge.

### 2. Materials tab ("Materiais")
- Upload PDF (title, subject select) → **status chips** (*Na fila → Processando n/N → Pronto / Falhou*) → list with pages and "Abrir PDF".
- Background ingestion with polling every 2 s; never block the UI.

## Data you own

Schema (9 tables, `docs/07-architecture-and-data.md`): `class_context`, `materials`, `chunks`, `students`, `sessions`, `events`, `evidence`, `analyses`, `insights` (add `updated_at`; statuses `new | accepted | dismissed | resolved`). Seed: demo students (some real, some **simulated with the badge**), class context "8º ano", and a few demo insights so the UI is never empty.

## Materials pipeline (`packages/sources`)

PDF → store file → text layer per page (vision only for pages that need it) → page chunks → FTS index → chapter outline → `ready`. Entry points: `POST /api/materials` (background job) and `scripts/ingest.ts` (same code). Also: `searchChunks`, `getPages`, `getOutline`, and **`validateCitation`** (the `quote` must occur in that page's text, accent- and whitespace-insensitive). Details: `docs/04-knowledge-and-sources.md`.

## The insights pipeline (your key deliverable)

Full spec in `handoffs-and-insights-pipeline.md` §4. In short:

1. **Trigger:** `session_ended` → your `SessionEndedHandler(sessionId)`.
2. **Counters** from events and evidence (hints, verifications, correct, independent-correct).
3. **LLM structured call** (Zod-validated JSON): `gaps`, `progress`, `suggestions`, each with **evidence quotes** (event ids). Student sent **pseudonymized** (no names).
4. **Write** `analyses`, then **upsert `insights`**: match existing open gaps (no duplicates), clamp confidence when evidence < 2, drop quotes that do not occur in the event text, mark a gap `resolved` after ≥ 2 independent correct answers.
5. **Expose:** metrics SQL, `getLearnerSummary(studentId)` (top 5 open gaps, top 3 progress; dismissed excluded) for Person 3.
6. **Robust:** idempotent per session, one retry on failure, dev endpoint to re-run.

You can build and test all of this **without the whiteboard** using the fixture event log (a conversation with a clear wrong answer).

## Task list (order = priority)

| # | Task | Tier | Est. | Done when |
|---|---|---|---|---|
| T1 | Schema + SQLite repository + seed (`memory.ts` parity). **Deliver by hour 3** | Must 7–8 | 3.5 h | Person 3 runs against it; seed creates students, class context, demo insights |
| T2 | Session/events/student-list APIs (`POST /api/sessions`, `GET events`, `GET students`), `/api/files/:id` | Must 7 | 2 h | Whiteboard start screen lists students and materials |
| T3 | Ingestion pipeline + script + FTS + outline + `validateCitation` | Must 4 | 6 h | Demo book ingested; search returns the right pages; fake quote rejected |
| T4 | Analysis → insights (on the fixture log first) | Should 10 | 5 h | A fixture conversation yields a gap + suggestion with real quotes |
| T5 | Students tab: metrics + table + create student | Should 9a | 4 h | Metrics match SQL; live feed (or polling) shows new insights |
| T6 | Student detail: evolution, gaps, suggestions, accept/dismiss | Should 9a | 5 h | The demo gap shows the student's own words |
| T7 | Class context card + API | Should 9b | 1.5 h | Change grade level; tutor receives it (check with Person 3) |
| T8 | Materials tab: upload, status polling, list | Should 9c | 5 h | Upload a PDF and watch it become `Pronto` |
| T9 | Visual polish with the **impeccable skill** (see below) | Should | 3 h | Passes the design checklist |
| T10 | Replay of a conversation (read-only board) | Nice 14 | 3 h | Opens from a gap |

**If time runs short, cut in this order:** Materials upload UI (keep the script) → class-context form (keep the seed) → create-student form (keep the seed) → evolution chart (keep gaps and suggestions). **Never cut:** persisted conversations, evidence, analysis → insights, the student detail with gaps.

## Visual direction (shared with Person 2)

Light **beige** background with the **Mento blue** from the logo, the logo in the sidebar header, the mascot for empty states and loading, the same **chips** (source, status, "Dados simulados") as the whiteboard. See `docs/18-ui-references.md` §6 for tokens and §4 for the layout. **Use the `impeccable` skill** for every screen: invoke it per screen, apply its guidance on typography, spacing, hierarchy and motion, then run the checklist (contrast, empty/loading/error states, keyboard, 1280–1920 px laptops). *If the skill is not installed, use Anthropic's `frontend-design` skill and tell the founder.*

## Acceptance criteria

- [ ] Opening the teacher interface in **three browser tabs** shows the same data.
- [ ] Students tab shows the four metrics and updates within ~5 s after a conversation ends.
- [ ] A real whiteboard conversation with a wrong answer produces, within ~60 s of ending, a **gap with the student's own quote** and a **suggestion**.
- [ ] Dismissing an insight removes it from the open counts and from the learner summary.
- [ ] The class context appears in the tutor prompt (verified with Person 3).
- [ ] Seed and ingestion run on a clean checkout.
- [ ] No student names are sent to the LLM; simulated data is always badged.

## Risks

- **Books are large:** cap pages for the demo and pre-ingest the book.
- **Analysis quality:** unrealistic gaps from short sessions → clamp confidence and require evidence.
- **Scope:** this is the heaviest Should; follow the cut order; Person 2 may take presentational components after their Must.
