# 06 — Teacher interface

> Status: **rewritten 2026-10-30** for the simplified product model; **backend implemented 2026-10-30** (see "Backend as implemented" below). Should-have item 9 (`01-hackathon-scope.md`). Layout and shared components: `18-ui-references.md` §4; brand: `19-brand-assets.md`. Last updated: 2026-10-30.

## Principles

1. **One teacher, one workspace.** No login, no roles, no multi-teacher support (a quick win). All state is **server-side**, so opening the teacher interface in three browser tabs shows exactly the same thing.
2. **Two entities, two tabs:** **Students** and **Materials**. (The class context lives with the students; see below.)
3. **The whiteboard generates the data.** The teacher never enters learning data: conversations are stored and analyzed automatically into insights.
4. **Simple first:** students may be created in the UI or directly in the database (seed); materials are uploaded in the UI (or ingested by script as a fallback).
5. **Evidence, not rankings.** Every gap shows evidence and uncertainty; no scores, no student ranking, no permanent labels. **The teacher decides:** suggestions can be accepted or dismissed; nothing is automated.
6. Prototype shortcut: **fictional data only** (no authentication; see `08-privacy-zdr-security.md`).

## Navigation

Left sidebar with the logo and two items: **Alunos** (Students) and **Materiais** (Materials). All UI text in pt-BR.

## Tab 1 — Students ("Alunos")

### 1.1 Overview metrics (header of the tab)

| Metric | Definition |
|---|---|
| **Students** | Number of students (real and simulated; simulated count shown separately) |
| **Conversations** | Number of tutoring sessions across all students |
| **Gaps identified** | Number of `gap` insights not dismissed by the teacher |
| **Insights generated** | Number of insights of any kind (`gap`, `progress`, `suggestion`) |

> The founder's note said "gaps generated, *sites* generated"; we read "sites" as **insights** (speech-to-text slip). Confirm in `10-decisions.md` (Q13).

### 1.2 Class context card

A single card at the top of the tab (one global class): see [Class context](#class-context-turma) below.

### 1.3 Student list

Table: name, conversations (n), last activity, open gaps (n), latest insight, a "simulated data" badge when applicable. Button **Create student** (name only; no password). Clicking a row opens the student detail.

### 1.4 Student detail

| Section | Content | Source |
|---|---|---|
| **Header** | Name, number of conversations, last activity | `students`, `sessions` |
| **Evolution** | Per concept: how it is going across conversations (correct and independent answers over time, `n` shown); "insufficient evidence" is its own state | `evidence` |
| **Gaps** | Concept, short description, **evidence** (the student's own words/answers with link to the conversation moment), confidence, first/last seen | `insights` (`kind=gap`) |
| **Suggestions** | **Proactive** next steps for the teacher (e.g., "revisit Republic vs Empire with a timeline activity"), with **Accept** / **Dismiss** | `insights` (`kind=suggestion`) |
| **Progress notes** | Positive changes (e.g., "now explains the Senate's loss of power without hints") | `insights` (`kind=progress`) |
| **Conversations** | List of the student's conversations; open one for a read-only replay (nice) | `sessions`, `events` |

"Proactive" means the system creates insights **automatically after each conversation**; the teacher does not request an analysis. New insights show a "new" marker.

#### As implemented in the front-end (D69)

The page follows the Stitch "Alunos" and "Detalhes do aluno" screens and reads the teacher API (`apps/web/src/app/(teacher)/professor/`; mock with `NEXT_PUBLIC_MOCK_API=1`).

- **Students tab:** four cards (students mapped, concepts in mapping, active gaps, mediation suggestions), the editable class notes (`PUT /class-context`, a description naming a student is refused with 422), the class block built from the real gaps (D71): **Tópicos com mais dificuldade** (open gaps grouped by topic, the students and their stage, the lesson where it starts) and **Intervenção para a próxima aula** (top 3 topics; **Dispensar** applies to every student's suggestion in the topic, D73), and the table "Fichas pedagógicas individuais" (student, diagnosis status, last conversation, top gap or concept, "Ver diagnóstico").
- **Student page:** header with the pedagogical focus (lesson most recently studied); **concept map** (one row per concept, one dot per conversation, `n`, state: consolidated, in transition, in sampling, active gap); each open gap with its stage (Em observação, Lacuna, Persistente), the analysis' diagnosis in paraphrase, the likely origin (earlier lesson and pages) and the counts, with **Dispensar**; **the student's own words are never shown nor sent by the API (D70)**; (D73: no per-student intervention nor support-material blocks); "Conceitos superados e pontos fortes" (Superado, Ponto forte, Em sondagem); the conversations by lesson with their analysis status.
- **Live:** the screens refresh on `insight_created` / `analysis_status` (SSE) and poll every 20 s as a fallback. States for loading, empty and "API unreachable" (with retry).

### 1.5 Create student

Form: **name**. The student then appears in the student picker of the whiteboard start screen. (Alternative: create rows directly in the database/seed.) No password: students pick their own name in the prototype.

### 1.6 Exercise lists (D72)

Each intervention has **Gerar lista de exercícios**: Claude writes 5 questions (3 multiple choice, 2 open) on the topic from the lesson of the book where the difficulty starts. The card shows "generating", then the questions and two PDFs (teacher with answers, students without). Every list is kept and listed in **Materiais → Listas de exercícios geradas** (with delete). Storage: `exercise_lists` (docs/07). Replaces the simulated lists of D68.

A ready list can be **edited** (D81): **Editar questões** opens an editor for the title and every question (texts, options and the right one, expected answer, why, page), with add, delete and reorder. The PDFs follow the saved version; an edited list is marked "revisada por você".

## Tab 2 — Materials ("Materiais")

- **Upload a PDF** (e.g., a book): only the **title** (defaults to the file name). In the prototype a teacher has **one subject** (D67), so the UI sends that subject's `subject_id` (D64) without asking; the subject selects the tutor's **subject profile** (`03-tutor-and-prompts.md`).
- **Processing status** per material: *Na fila → Processando (n/N páginas) → Pronto / Falhou*. Processing runs in the background; the tab polls for status.
- **List** of materials: title, pages, status, date; open the PDF.
- Delete/rename/re-process: nice-to-have.
- Details of ingestion and retrieval: `04-knowledge-and-sources.md`.

## Class context ("Turma")

One global setting applied to **every student chat on every whiteboard** (single-class quick win).

| Field | Description |
|---|---|
| **Grade level** | One of **7º ano, 8º ano, 9º ano** (Ensino Fundamental II). Ensino Médio and college are future |
| **Description** | Free text by the teacher about the class: reading level, interests, typical difficulties, pace, tone that works. Example: *"Turma de 8º ano, nível de leitura mediano, gostam de jogos e vídeos curtos, dificuldade com datas e linha do tempo."* |

Rules: no student names or personal data in the description; kept short (a few hundred characters). The tutor receives it in the **course-context layer** of the prompt and adapts vocabulary, examples, length and tone to the grade level (`03-tutor-and-prompts.md`).

## Data and endpoints (no authentication)

Data: `class_context`, `materials`, `students`, `sessions`, `evidence`, `analyses`, `insights` (`07-architecture-and-data.md`).

| Endpoint | Purpose |
|---|---|
| `GET /api/overview` | The four metrics |
| `GET/PUT /api/class-context` | Read/update the class context |
| `GET /api/students`, `POST /api/students` | List (with per-student counts) / create |
| `GET /api/students/:id` | Detail: sessions, evidence aggregates (evolution), insights |
| `PATCH /api/insights/:id` | Set status `accepted` / `dismissed` |
| `GET /api/materials`, `POST /api/materials` (multipart) | List / upload (starts background ingestion) |
| `GET /api/materials/:id` | Status and metadata |

## Backend as implemented (2026-10-30)

The teacher backend exists and is tested (`pnpm test:rules`, `pnpm e2e:teacher`); the screens are still to be built on top of it.

- **Insights section (critical, medium, positive).** Every insight has a `severity` decided by deterministic rules (D58): *critical* (the same concept wrong in several conversations, or twice in one), *medium* (a first error, a partial answer, or a correct answer only with hints), *positive* (answers right without help, or a previous gap overcome). `GET /api/insights` returns the class-wide section grouped by severity; `GET /api/students/:id/insights` returns the per-student table.
- **Insights appear by themselves.** When a student leaves a conversation (`POST /sessions/:id/end`), the analysis runs on what the tutor stored in MongoDB, after the last answer has been judged; nothing is mocked and the teacher does nothing (D65). Only registered students are analysed. The lesson being studied and the lesson of each answer come from the pages the tutor cited, so a student who studies lesson 6 but keeps missing lesson 2 gets that root cause.
- **Root cause from the material.** A gap says whether the difficulty is in the lesson being studied, in an **earlier lesson** it depends on (with the lesson, pages and whether it was taught in class), or outside the material (D59). The student detail shows the latest analysis `summary`, e.g. *"Está estudando a crise da República, mas as dúvidas vêm de Formas de governo (Lição 2)"*.
- **Student detail also shows** the mocked personal data and school history (profile, guardian, 6º/7º ano grades, current term; D57).
- **Dismissing a gap also dismisses its suggestion;** a dismissed insight is never reopened by later analyses (D63).
- **Class context** is rejected if it names a student (the tutor reads it in every chat).
- **Upload linked to a subject.** The teacher picks the subject (matéria) and sends a PDF: only PDFs, no duplicates (same content returns the existing material), `202` right away. In the background: text per page → chapters → passages with **embeddings in the vector store** (the same pipeline as `pnpm ingest`) → lesson sequence → `ready`. Status `queued → processing (extracting n/N, embedding n/N) → ready | failed`. Only `ready` materials appear in the subject and reach the tutor; a failure keeps the reason and leaves nothing half-searchable (D64).
- Endpoints: `workstreams/contracts-spec.md` §15 and `/api/openapi.json`.

## Out of scope for the teacher UI

Authentication, multiple teachers, multiple classes, per-class or per-student configuration, gradebook, editing the tutor prompt, full exam generation (only the per-intervention exercise lists of D68), family access.

## Open questions

1. Placement of the class context card (we placed it in the Students tab; alternative: a small section in Materials).
2. Student access method beyond picking a name (e.g., a link per student).
3. Whether the overview should show "active this week" in addition to the four metrics.
