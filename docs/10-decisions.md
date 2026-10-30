# 10 — Decisions

> Living log. Add new entries at the top of each section. Last updated: 2026-10-30.

## Decided

| # | Decision | Rationale |
|---|---|---|
| D1 | Company/product name: **Mento** | Founder's choice. Trademark/domain availability **not verified**. |
| D2 | Hackathon demo subject: **History — Ancient Rome**; no math in the demo | Makes illustrations central and keeps one subject |
| D3 | **Language:** repo, code and docs in English; product (UI, tutor, content) in pt-BR | Founder's instruction |
| D4 | Must = AI whiteboard (writes/draws live) + two-way text conversation grounded in teacher material + visible sources + evidence + event log | Core of the thesis |
| D5 | Teacher side: **no editing UI**; backend models subjects/lessons/sources now; teacher screen is a single read-only page (Should #8, ahead of voice) | ~24h; teacher side must show materials and the AI's per-student picture |
| D6 | Voice is Should #10, text is the guaranteed baseline | Latency/cost risk; one brain, voice as wrapper |
| D7 | Voice architecture: **cascade STT → LLM → TTS** over a single Tutor Core | One brain for chat and voice; choose best model for pedagogy; fits ZDR provider choice |
| D8 | ~~Whiteboard: tldraw as leading candidate~~ **Superseded by D18** (DOM board). Still: do not build a drawing engine from scratch | Time |
| D9 | Source linkage is explicit: subject → lesson → source; retrieval filtered by lesson | Deterministic, no guessing |
| D10 | Retrieval: start by putting the lesson's pages in context (cached); FTS next; embeddings last | Avoid over-engineering |
| D11 | Highlight: model parses PDF → Markdown per page; highlight by text search in pdf.js; Reducto-style bbox only as upgrade | No extra vendor in 24h |
| D12 | Prompts are text files in 3 layers (base + subject profile + course context) | Freedom to iterate fast |
| D13 | Data model: 9 tables, JSON where flexible | No over-engineering |
| D14 | No "learning styles"; student picture = what worked on tasks, with `n` and uncertainty | Research basis; credibility with educators |
| D15 | ZDR: design for it, do not claim certification | Needs enterprise agreements |
| D16 | Classroom transcription (Wispr Flow-style) is **future**, fits as `Source.type = transcript` | Founder's idea; not in hackathon |
| D17 | Exam/question generation is **future** | Reuses sources + concepts later |
| D18 | Board is **DOM in columns with element ids**, no canvas and no tldraw. **Supersedes D8.** | Studdy teardown: simple, deterministic layout, click-and-ask for free, no license risk (`15`, `16`) |
| D19 | Tutor = LLM emitting a **script of tool calls streamed over SSE**; client plays an ordered action queue; every action is an event in the log | Observed mechanism; simplest way to sync speech and drawing (`16` §3) |
| D20 | Voice stays **cascade**: Deepgram STT from the browser (ephemeral token) + TTS bake-off **ElevenLabs Flash v2.5 (default, naturalness + latency) / Azure Speech (fallback) / Cartesia**; **Deepgram Aura-2 excluded (no Portuguese)** (`11`) over the same Tutor Core. **Refines D7.** | One brain; captions need word timestamps; matches what Studdy does for STT |
| D21 | Two drawing pipelines: **artistic image** via image model (pre-generate + cache for the demo) and **structured SVG** streamed by a second LLM call; **deterministic `write_timeline`** for exact dates | Observed pipelines; assertiveness for History |
| D22 | All model-emitted HTML/SVG passes an allowlist sanitizer; citations are validated server-side against the chunk text | Safety and no fabricated citations |
| D23 | Day-0 bake-offs before building: pt-BR handwriting font, image model, TTS, LLM tool reliability | Cheap checks that remove the biggest unknowns |
| D24 | **Stack:** TypeScript everywhere, one **Next.js** project (App Router), **Zod** contracts, Tailwind, **SQLite**, provider SDKs called directly, `tsx` scripts; demo runs on a laptop/VM with Node | Shared types/contracts for 3 people in parallel; SSE and browser libs (pdf.js, KaTeX, Web Audio) are JS anyway; no Python-only need. **Resolves Q1** |
| D25 | **Work split** in 3 independent lanes (A board+student UI, B tutor core, C data+sources+teacher+voice) with directory ownership, frozen contracts, mocks and checkpoints at H8/H14/H18 (`17`) | Minimal conflicts; Must first |
| D26 | **UI direction:** one shared design language for both interfaces; student session is voice-first with an **orb + mascot at bottom center** (idle/listening/thinking/speaking) over a DOM board; teacher UI is Flint-inspired (sidebar, insight card, student table/card); own lightweight orb preferred over a Three.js dependency (`18`) | Looks like one product; cheap to build |
| D27 | **Brand:** logo = `logo-05-learning-path` (blue wave "m" + navy `mento` wordmark, `assets/brand/logo.png`); mascot = round blue character with 4 transparent GIFs; brand colors sampled from the files (`#1E59ED`, `#162250`, accent `#FC724A`); UI typeface proposal Nunito; the orb uses the mascot as its face (`19`). **Resolves Q11** | Assets exist; consistent look across student and teacher UIs |

## Open

| # | Question | Owner | Notes |
|---|---|---|---|
| Q1 | ~~Stack~~ **Resolved by D24** (TypeScript + Next.js + SQLite). Hosting for the demo: laptop or small VM | Team | Confirm hosting |
| Q2 | Exact code-freeze time (affects the cut line at ~hour 18) | Founder | |
| Q3 | Nice-to-have 12 "My progress" for the student: build it, or teacher-only view? | Founder | Founder did not choose option A (teacher-only) vs B (also student view); default A |
| Q4 | Which LLM, image model and TTS (TTS shortlist: Azure / ElevenLabs / Cartesia); budget cap; ZDR options | Team (discovery) | See `11` (TTS section) |
| Q5 | Source PDFs for Ancient Rome: which materials, are they text-based or scanned, are rights OK | Team | Test early |
| Q6 | Seed images for Rome: who prepares/reviews the 4–6 pre-generated images (image-model bake-off first) | Team | See `16` §7 |
| Q7 | Hackathon rules: IP ownership, sponsor license, code publication | Founder | Read before submitting |
| Q8 | ~~tldraw license~~ no longer relevant (D18) | — | — |
| Q9 | Assign Lane A/B/C to the 3 people (the split itself is in `17-work-split.md`) | Team | Assign before kickoff |
| Q10 | Trademark/domain availability for "Mento" | Founder | Not verified |
| Q11 | ~~Mascot/logo~~ **Resolved by D27.** Remaining: SVG versions, symbol-only/favicon export, confirm colors and typeface | Founder | See `19` §6 |

## How to use this file

- Make a decision → move it from Open to Decided with a short rationale.
- If a decision reverses a previous one, add a new row and mention the one it supersedes.
- Update the topic doc and `01-hackathon-scope.md` if scope changes.
