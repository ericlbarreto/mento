# 07 — Architecture and data

> Status: **conceptual**. Stack is not decided; concrete choices come out of technical discovery (`13-technical-discovery-and-split.md`). Last updated: 2026-10-30.
> **Update 2026-10-30:** the board technology and the tool protocol in this document are **superseded by `16-technical-roadmap.md`** (DOM board in columns, tutor as a script of tool calls over SSE; no tldraw). Product intent here still applies.

## Principle

**One tutor brain, pluggable channels.** The Tutor Core owns the turn loop, tools, retrieval and evidence. Text chat, the board and voice are adapters around it. No over-engineering: few tables, JSON where flexible, prompts as files.

```
Client (web)
  ├─ Chat UI ─────────┐
  ├─ Whiteboard ──────┼─► WebSocket /sessions/{id}/stream
  └─ Voice (mic/audio)┘            │
                                   ▼
                  Voice adapter (STT in / TTS out)   ← only in voice mode
                                   │
                                   ▼
                      Tutor Core (single LLM loop)
              tools: speak, write_text, draw, highlight,
                     ask_verification, record_evidence, ...
                                   │
                    Event log + Evidence + Sources
```

## Components

1. **Tutor Core:** builds the 3-layer prompt, runs the LLM loop, executes tools, emits events.
2. **Whiteboard engine:** validates tool actions (see `16`), keeps board state, renders with deterministic DOM components (see `16-technical-roadmap.md`).
3. **Sources service:** material ingestion (UI upload + script), text-index retrieval scoped to the materials of the chosen subject (D47), citation data (`04-knowledge-and-sources.md`).
4. **Event log:** append-only; the single source for replay, evidence and analysis.
5. **Analysis job:** post-session; counters + LLM structured output.
6. **Teacher API** (students, materials, class context, insights, overview metrics; single workspace, no auth).
7. **Voice adapter (Should):** STT in / TTS out around the Tutor Core.

## Minimal data model (9 tables)

```
class_context (id = 1, grade_level, description, updated_at)
materials     (id, title, subject, profile_key, type, file_path, status, page_count, outline JSON, created_at)
chunks        (id, material_id, page, text)                  + MongoDB text index (default_language: portuguese)
students      (id, name, is_simulated, created_at)
sessions      (id, student_id, material_id, topic, persona, modality, started_at, ended_at)
events        (id, session_id, ts, type, payload JSON)
evidence      (id, session_id, student_id, concept, concept_key, result, independent, hints_used, rationale, citation JSON, ts)
analyses      (id, session_id, student_id, result JSON, created_at)
insights      (id, student_id, session_id, kind, concept, concept_key, title, body, confidence, evidence JSON, status, created_at, updated_at)
```

- **Single teacher:** no `teachers` table, no authentication, no organizations or roles. `class_context` is a **single row** (global class).
- `materials.status` ∈ `queued | processing | ready | failed`; `type` ∈ `pdf | transcript`; `profile_key` selects the subject profile (`generic` by default).
- `insights.kind` ∈ `gap | progress | suggestion`; `insights.status` ∈ `new | accepted | dismissed | resolved` (a gap becomes `resolved` after repeated independent correct answers); full pipeline in `workstreams/handoffs-and-insights-pipeline.md`.
- `concept` is a short pt-BR label and `concept_key` its normalized form (shared `normalizeConcept`, `workstreams/contracts-spec.md` §7): no concept table or prerequisite graph. `evidence.result` ∈ `correct | partial | incorrect`.
- `events` is **append-only** with JSON `payload`. `analyses.result` is free JSON; `insights` are the denormalized, teacher-facing rows derived from it.
- `students.is_simulated` drives the "simulated data" badge.
- Teacher metrics are **SQL aggregates** (counts of students, sessions, gap insights, insights); no extra tables.

### Data flow for the teacher's insights

```
Whiteboard conversation ─► events + evidence ─► analysis (after each session)
        ▲                                              │
        │                                              ▼
 learner summary (open gaps) ◄──────────── insights (gap / progress / suggestion)
                                                       │
                                                       ▼
                                  Teacher: Students tab (metrics, student detail)
```

### Teacher-side data model as implemented (2026-10-30, D57–D63)

The block above is the conceptual model. What exists in MongoDB today (`packages/db`, snake_case, relations as string ids):

| Collection | Notes |
|---|---|
| `students` | `fixture_id`, `name`, `is_simulated`, `profile` (birth date, enrollment, class, guardian), `school_history[]`, `current_term[]`: fictional, read-only, never sent to an LLM |
| `classcontexts` | singleton: `grade_level`, `description` |
| `materials` (shared with the whiteboard) | one per book: `title`, `subject` (key) and `subject_id`, `pages`, `chapters`, `status` (`queued → processing → ready | failed`), and from the upload `file`, `progress`, **`sequence`** (lessons with prerequisites), `pages_needing_ocr`, `toc_pages`, `passages`. Lab data has `is_fixture` and never reaches the tutor |
| `chunks` (shared) | embedded passages (Voyage, 1024 numbers) the tutor searches; filled by the upload job through the whiteboard's `ingestPdf` |
| `analyses` | one per session (unique `session_id`): status, `input_hash`, versions, findings, summary, rejections |
| `insights` | `gap | progress | suggestion` rows with `severity`, `rule`, `diagnosis`, `root_cause`, `metrics`, `evidence`, `status` |

**Whiteboard collections (Person 3):** `subjects`, `sessions`, `events`, `evidences`, plus the shared `materials` and `chunks` above. The teacher code only resets its own collections and fixture materials.

**Conversations (Person 3):** `sessions`, `events` and `evidences` are written by the tutor and read, never written, by the analysis (`MongoConversationReader` → `toSessionBundle`, D65). The material and the lesson of a conversation are derived from the sources the tutor cited. The JSON file in `fixtures/analysis-lab/` is only a demo/test source.

### Exercise lists (D72)

Collection **`exercise_lists`** (Mongoose model `ExerciseList`, snake_case timestamps), one document per list with the questions embedded:

| Field | Meaning |
|---|---|
| `title`, `concept`, `concept_key` | The topic the class struggles with (from the intervention) and the title Claude gave the list |
| `material_id`, `material_title`, `lesson_id`, `lesson_title`, `pages` | The book and lesson where the difficulty starts (from the conversations' material, or the gaps' lesson of origin) |
| `grade_level` | From the class context at generation time |
| `gap_ids`, `student_count` | The open gaps the list was made for; the UI only shows the count |
| `status`, `error` | `generating` → `ready` or `failed` (reason) |
| `exercises[]` | `{ id, kind: choice/open, prompt, options?, answer, explanation, page }` |
| `model`, `prompt_version` | Reproducibility (`claude-opus-5-5`, `exercises-v1`) |

Indexes: `created_at` (desc), `concept_key`. The prompt (`prompts/exercises.md`) receives the topic, grade level, class description, the lesson (title, summary, key concepts) and up to 12 pages of passages: **never a student's name or words**. The PDFs (teacher with answers, student without) are built in the browser from the stored list; no file is stored.

## Event contract (single typed schema for all channels)

**Client → server** (stored as events; full list in `workstreams/contracts-spec.md` §3): user messages (`kind` = chat, speech, board_select, quick_action), answers to verifications, interruptions, end of conversation. Audio chunks go to the STT provider, not to our API.

**Server → client** (SSE, `16` §3.2): `action` (any tool call), `stream` (SVG chunks), `tutor_state`, `done`. Evidence and insights reach the teacher side through the database and the teacher live feed, not through this stream.

Benefits: replay for the teacher is just replaying the log; voice always produces a transcript so voice sessions also appear as chat; testing text tests the whole pedagogical loop.

## Board operations

> Superseded by `16-technical-roadmap.md` §4–5 (tool actions on a DOM board).

Typed operations validated by the app (the model never emits arbitrary HTML). Each object has a stable ID, type, content, position, author (tutor or student), timestamp, state, and optional link to concept/source. See `02-student-experience-whiteboard.md`.

## Voice architecture

| | **Cascade (STT → LLM → TTS)** | **Native speech-to-speech** |
|---|---|---|
| Brain | **One**, same as chat | Realtime model becomes the voice brain |
| Chat + voice | Voice is a wrapper over text | Needs a second loop for chat |
| Latency | Higher (~1–2s with good streaming) | Lower, better interruption |
| Model choice | Use the best model for pedagogy | Limited to provider offering |

**[Decision]** Cascade with streaming, over the same Tutor Core. A native realtime model can later act as a "voice front" calling the Tutor Core as a tool without changing the event contracts. Providers should offer zero-data-retention options. Interruptions: detected speech (VAD) cancels ongoing TTS and the LLM stream; define this up front.

Build order: (1) Tutor Core + text chat + board + sources; (2) voice as a wrapper; (3) toggle becomes an adapter swap on the client. If voice fails at pitch time, text + board is the fallback.

## What we deliberately do not build

Prerequisite graph, full BKT, a separate orchestration service, embeddings (unless needed), job queues, real authentication.

## Open technical decisions

See `13-technical-discovery-and-split.md` and `10-decisions.md`: language/framework (front and back), database (decided: MongoDB + Mongoose, D46), LLM/STT/TTS providers, whiteboard library confirmation, PDF viewer, hosting.
