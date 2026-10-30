# 13 — Technical discovery and work split

> Status: **stack decided (D24); the work split lives in `17-work-split.md`.** Remaining items below are the day-0 checks and open choices. Last updated: 2026-10-30.
> **Update 2026-10-30:** the board technology and the tool protocol in this document are **superseded by `16-technical-roadmap.md`** (DOM board in columns, tutor as a script of tool calls over SSE; no tldraw). Product intent here still applies.

## Goals of the discovery

Turn the conceptual design (`07-architecture-and-data.md`) into concrete choices the 3 people can build in parallel, within ~24h.

## Decisions to make (check off and record in `10-decisions.md`)

- [x] Language/framework for backend and frontend: **TypeScript + Next.js** (D24)
- [x] Database: **SQLite** (D24)
- [x] Repository: https://github.com/ericlbarreto/mento (`main`)
- [ ] Hosting/deployment for the demo
- [ ] LLM provider and model for the tutor; model for analysis
- [ ] STT and TTS providers (Should): STT = Deepgram; **TTS default = ElevenLabs Flash v2.5** (Azure fallback, Cartesia third) pending the 15-minute listening test in `11-technology-research.md`; budget cap per test hour
- [ ] Whiteboard: DOM board in columns (decided, D18); check handwriting font with pt-BR accents
- [ ] PDF viewer: pdf.js and how to highlight a quote by text search
- [ ] Ingestion approach: model reads PDF → Markdown per page
- [ ] Whether the whole lesson fits in context (cached) or needs FTS
- [ ] Board operation schema (JSON types, validation)
- [ ] Event schema (client ↔ server) and transport (WebSocket vs SSE)
- [ ] Repo layout (monorepo or separate folders) and how to run locally

## Proposed lanes (to confirm; not assigned to anyone yet)

Three natural parallel lanes with clear interfaces between them:

1. **Board + student UI:** whiteboard, chat panel, source chips, PDF viewer, click-and-ask.
2. **Tutor Core + sources:** prompts, LLM loop, tools, ingestion script, retrieval, citations, evidence recording.
3. **Data + analysis + teacher screen:** schema, event log, read API, post-session analysis, teacher page, simulated data; voice later.

Contracts between lanes: the **board operation schema** and the **event schema**. Define them first and mock them so lanes do not block each other.

## Suggested first hour (all three together)

1. Pick stack (above).
2. Write the action/tool schema and the event schema as shared Zod files (`src/contracts`).
3. Create the repo skeleton and a "hello world" end to end: student sends text → Tutor Core replies with one `write_text` action → board renders it → event stored.
4. Split into lanes.

## Outputs to produce here

- Final stack list with rationale.
- Shared schemas (board ops, events) with examples.
- Lane assignment per person and the first tasks of each lane.
- Local run instructions (also update `AGENTS.md` repo map).
