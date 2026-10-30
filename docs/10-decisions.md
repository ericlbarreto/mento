# 10 — Decisions

> Living log. Add new entries at the top of each section. Last updated: 2026-10-30.

## Decided

| # | Decision | Rationale |
|---|---|---|
| D1 | Company/product name: **Mento** | Founder's choice. Trademark/domain availability **not verified**. |
| D2 | Hackathon demo subject: **History — Ancient Rome**; no math in the demo | Makes illustrations central and keeps one subject |
| D3 | **Language:** repo, code and docs in English; product (UI, tutor, content) in pt-BR | Founder's instruction |
| D4 | Must = AI whiteboard (writes/draws live) + two-way text conversation grounded in teacher material + visible sources + evidence + event log | Core of the thesis |
| D5 | ~~Teacher side: no editing UI; single read-only page~~ **Superseded by D30** (two-tab teacher interface: Students and Materials) | Founder's simplified product model |
| D6 | Voice is Should #10, text is the guaranteed baseline | Latency/cost risk; one brain, voice as wrapper |
| D7 | Voice architecture: **cascade STT → LLM → TTS** over a single Tutor Core | One brain for chat and voice; choose best model for pedagogy; fits ZDR provider choice |
| D8 | ~~Whiteboard: tldraw as leading candidate~~ **Superseded by D18** (DOM board). Still: do not build a drawing engine from scratch | Time |
| D9 | ~~Source linkage: subject → lesson → source~~ **Superseded by D31** (explicit link conversation → chosen material; no subject/lesson hierarchy). Principle kept: the AI never guesses the material | Deterministic |
| D10 | Retrieval: all pages in context only for small materials; **for books FTS + outline is the default** (D32); embeddings last | Books do not fit in context |
| D11 | Highlight by text search in the pdf.js text layer; **extraction uses the text layer first, vision only for pages that need it** (refined by D32); Reducto-style bbox only as upgrade | No extra vendor in 24h; books are expensive to read page by page with a vision model |
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
| D28 | **Monorepo:** light pnpm-workspace monorepo — `apps/web` (Next.js) + `packages/{contracts,ui,board,tutor,db,sources,analysis,voice}`, root `scripts/`, `fixtures/`, `prompts/`; packages consumed as TS source (no build step), **no Turborepo/Nx**; boundaries enforced by declared dependencies; env read only in `apps/web` and `scripts/`. **Refines D24 and replaces the `src/*` layout of `17`** (`21`) | Founder's request; package ownership maps to lanes and makes boundaries enforceable |
| D26 | **UI direction:** one shared design language for both interfaces; student session is voice-first with an **orb + mascot at bottom center** (idle/listening/thinking/speaking) over a DOM board; teacher UI is Flint-inspired (sidebar, insight card, student table/card); own lightweight orb preferred over a Three.js dependency (`18`) | Looks like one product; cheap to build |
| D27 | **Brand:** logo = `logo-05-learning-path` (blue wave "m" + navy `mento` wordmark, `assets/brand/logo.png`); mascot = round blue character with 4 transparent GIFs; brand colors sampled from the files (`#1E59ED`, `#162250`, accent `#FC724A`); UI typeface proposal Nunito; the orb uses the mascot as its face (`19`). **Resolves Q11** | Assets exist; consistent look across student and teacher UIs |
| D29 | **Single teacher workspace, no authentication** (quick win): all teacher tabs show the same server-side data; fictional data only | Founder's simplification; faster to build; not for real use (`08`) |
| D30 | **Teacher interface = two tabs: Students and Materials.** Students are created in the UI or directly in the DB; materials are PDFs uploaded in the UI (script as fallback). **Supersedes D5** | Founder's simplified product model (`06`) |
| D31 | **Materials replace subject → lesson → source.** The student picks a name and **one material** (+ optional topic); the subject (set at upload) selects the subject profile; retrieval and citations are scoped to that material. **Supersedes D9** | Simplicity; deterministic grounding |
| D32 | **Books:** text-layer extraction first (vision only where needed), page chunks + **FTS index + chapter outline**; top-k pages + outline chapter per turn; `search_materials` as the normal tool; embeddings only if FTS recall fails; background ingestion job with status | Books do not fit in context; cost/time control (`04`) |
| D33 | **Class context:** one global setting (grade level 7º/8º/9º ano + free-text description) written by the teacher and applied to **every** student chat in the course-context layer of the prompt | Founder's request; adapts register and examples (`03`) |
| D34 | **MVP segment: Ensino Fundamental II (7º, 8º, 9º ano).** Ensino Médio and college are future | Founder's focus |
| D35 | **The whiteboard generates the data:** conversations are persisted; an automatic post-session analysis creates `insights` (`gap | progress | suggestion`); teacher metrics are SQL aggregates (students, conversations, gaps identified, insights generated); open gaps feed the learner summary; teacher accepts/dismisses | Founder's request; closes the loop (`05`, `07`) |
| D36 | **Data model v2 (still 9 tables):** `class_context`, `materials`, `chunks`, `students`, `sessions`, `events`, `evidence`, `analyses`, `insights` | Replaces `subjects`, `lessons`, `sources` (`07`) |

## Open

| # | Question | Owner | Notes |
|---|---|---|---|
| Q1 | ~~Stack~~ **Resolved by D24** (TypeScript + Next.js + SQLite). Hosting for the demo: laptop or small VM | Team | Confirm hosting |
| Q2 | Exact code-freeze time (affects the cut line at ~hour 18) | Founder | |
| Q3 | Nice-to-have 12 "My progress" for the student: build it, or teacher-only view? | Founder | Founder did not choose option A (teacher-only) vs B (also student view); default A |
| Q4 | Which LLM, image model and TTS (TTS shortlist: Azure / ElevenLabs / Cartesia); budget cap; ZDR options | Team (discovery) | See `11` (TTS section) |
| Q5 | The **history book PDF** for the demo: which book/chapter, text-based or scanned, size (pages), rights OK; real ingestion time and cost | Team | Test early (`04`) |
| Q6 | Seed images for Rome: who prepares/reviews the 4–6 pre-generated images (image-model bake-off first) | Team | See `16` §7 |
| Q7 | Hackathon rules: IP ownership, sponsor license, code publication | Founder | Read before submitting |
| Q8 | ~~tldraw license~~ no longer relevant (D18) | — | — |
| Q9 | Assign Lane A/B/C to the 3 people (the split itself is in `17-work-split.md`) | Team | Assign before kickoff |
| Q10 | Trademark/domain availability for "Mento" | Founder | Not verified |
| Q11 | ~~Mascot/logo~~ **Resolved by D27.** Remaining: SVG versions, symbol-only/favicon export, confirm colors and typeface | Founder | See `19` §6 |
| Q12 | Confirm the tiering: teacher tabs, class-context form and uploads in **Should**, with the **cut order** in `01-hackathon-scope.md`; Must adds only the data foundation (items 7–8) | Founder | The new teacher scope is larger than the previous single read-only page |
| Q13 | "sites gerados" in the founder's note is read as **insights generated** (speech-to-text slip). Confirm | Founder | Metric on the Students tab |
| Q14 | Class context placement (card in the Students tab vs section in Materials) and the example "8º ano do ensino médio": treated as **8º ano of Ensino Fundamental II** (8º ano is Fundamental in Brazil). Confirm | Founder | `06` |
| Q15 | Student access: **pick your name** (current) vs a link per student | Founder | No auth in the prototype |
| Q16 | Study scope: **one material per conversation** (current) vs all materials at once | Founder | `04` |

## How to use this file

- Make a decision → move it from Open to Decided with a short rationale.
- If a decision reverses a previous one, add a new row and mention the one it supersedes.
- Update the topic doc and `01-hackathon-scope.md` if scope changes.
