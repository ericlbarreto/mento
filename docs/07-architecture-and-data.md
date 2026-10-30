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
3. **Sources service:** ingestion script + retrieval by lesson + citation data.
4. **Event log:** append-only; the single source for replay, evidence and analysis.
5. **Analysis job:** post-session; counters + LLM structured output.
6. **Read API for the teacher screen.**
7. **Voice adapter (Should):** STT in / TTS out around the Tutor Core.

## Minimal data model (9 tables)

```
subjects   (id, name, profile_key, prompt_notes)
lessons    (id, subject_id, title, objective)
sources    (id, lesson_id, title, type, file_path)
chunks     (id, source_id, page, text)
students   (id, name, is_simulated)
sessions   (id, student_id, lesson_id, started_at)
events     (id, session_id, ts, type, payload JSON)
evidence   (id, session_id, student_id, concept, correct, independent, chunk_id, ts)
analyses   (id, student_id, session_id, result JSON)
```

- `concept` is **free text** in `evidence`: no concept table, prerequisite graph or mastery table.
- `events` is **append-only** with JSON `payload`. No elaborate event sourcing.
- `analyses.result` is free JSON in whatever shape the LLM returns; the frontend reads what it needs.
- No organizations, roles, classes or permissions: one teacher and a few students for the demo.
- `students.is_simulated` drives the "simulated data" badge.

## Event contract (single typed schema for all channels)

**Client → server**
`user_text`, `user_audio_chunk`, `board_select`, `board_stroke`, `answer_submit`, `mode_change`

**Server → client**
`action` (any tool call), `stream` (SVG chunks), `audio_chunk`, `tutor_state`, `evidence_recorded` (SSE format in `16` §3.2)

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

See `13-technical-discovery-and-split.md` and `10-decisions.md`: language/framework (front and back), database (SQLite vs Postgres), LLM/STT/TTS providers, whiteboard library confirmation, PDF viewer, hosting.
