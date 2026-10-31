# Mento

<p align="center"><img src="assets/brand/logo.png" alt="Mento" width="260"></p>

**Mento is an AI tutor for schools.** The teacher uploads the class materials (PDF books) and describes the class; each student talks to a tutor that **writes and draws live on a whiteboard**, answers **grounded in the teacher's books and cites the page**, and gives hints instead of answers. Every conversation is turned into **insights per student** (gaps, progress, suggested next steps) so the teacher sees how each student is learning and decides what to do.

> Thesis: *the school defines what must be learned; Mento teaches each student individually and turns the evidence from those sessions into pedagogical intelligence for the teacher.*

**Context:** built for the Teachy x LEPV 2026 hackathon, answering **Challenge 3** (use AI safely, saving time and preserving learning). **Segment:** Ensino Fundamental II (6º to 9º ano), starting with 7º to 9º. **Status:** working prototype, no customers, no proven efficacy. Demo students are fictional and labeled as simulated data.

**Language:** the repository (code, docs, commit messages) is in **English**. The product (UI, tutor replies, demo content) and the business plan and pitch are in **Brazilian Portuguese**.

## Start here

| If you are... | Read |
|---|---|
| An AI agent | [`AGENTS.md`](AGENTS.md) (just say *"Study the repository"*) |
| A person new to the project | [`docs/00-product-vision.md`](docs/00-product-vision.md), then [`docs/01-hackathon-scope.md`](docs/01-hackathon-scope.md) |
| Looking for the full doc index | [`docs/README.md`](docs/README.md) |
| Presenting or pitching | [`docs/business-plan/`](docs/business-plan/README.md) and [`docs/20-demo-runbook.md`](docs/20-demo-runbook.md) |

## Run it locally

Requirements: Node 22+, pnpm, a MongoDB instance (`MONGODB_URI`) and provider keys for the live features.

```bash
pnpm install
cp .env.example .env     # fill in your own keys; never commit .env
pnpm seed                # demo class context and fictional students
pnpm dev                 # web on :3000, API on :4000
```

Useful scripts (all in the root `package.json`): `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm fixtures:check` (what CI runs), `pnpm ingest` (index a PDF book), `pnpm turn` (run one tutor turn from the command line). `DEMO_MODE=fixture` replays recorded turns without calling the model. See [`docs/ci-cd.md`](docs/ci-cd.md) and [`scripts/README.md`](scripts/README.md).

## Repository map

```
apps/
  web/                  Next.js frontend: student (board, voice, chat) and teacher (students, materials, class, insights)
  api/                  Fastify API: routes, SSE for the live tutor turn, jobs; the only composition root
packages/
  contracts/            Zod schemas and shared types: the data shapes every other package agrees on
  board/                the whiteboard: operations, renderers, session replay
  tutor/                prompt building, tools and the tutor turn loop
  sources/              PDF ingestion, retrieval and citation validation
  analysis/             rules-based post-session analysis: evidence, gaps, stages, suggestions
  voice/                speech-to-text and text-to-speech
  db/                   MongoDB models and repositories
  ui/                   shared UI components and brand tokens
prompts/                tutor prompts as editable text files (see "Prompts" below)
docs/                   product and technical documentation (see "Documentation" below)
workstreams/            division of work among the 3 people
scripts/                tsx scripts: seed, ingest, smoke tests, benchmarks, demo boards
fixtures/               recorded JSON with the real shapes (turns, events, seed students, retrieval), validated against the contracts
materials/              sample PDFs for ingestion (git-ignored)
assets/                 brand source files: logo, mascot, concepts
.github/workflows/      CI: typecheck, lint, tests and fixture check on every PR
```

Dependency rules, ownership by path and the kickoff checklist: [`docs/21-repo-structure.md`](docs/21-repo-structure.md).

## Documentation (`docs/`)

Numbered in suggested reading order; **00, 01, 10 and 14 are mandatory** for anyone working on the project.

- **Product:** `00` vision · `01` hackathon scope (the source of truth for what we build and do not build) · `06` teacher interface · `02` student experience and whiteboard · `09` market and competitors.
- **How it works:** `03` tutor and prompts · `04` knowledge and sources · `05` learner model and analysis · `07` architecture and data · `08` privacy, ZDR and security.
- **Decisions and process:** `10` decisions log (every relevant change is recorded here) · `14` working rules · `13` technical discovery · `11` technology research · `12` glossary.
- **Build and ship:** `16` technical roadmap · `17` work split · `21` repository structure · `ci-cd.md` · `20` demo runbook.
- **Design:** `18` UI references · `19` brand assets · `15` teardown of a competing whiteboard tutor.
- **Integration guides:** `frontend-contract.md`, `frontend-integration.md`, `frontend-rendering-guide.md`, `teacher-data-integration.md`.
- **Working notes:** `plans/` and `superpowers/` (specs, plans and hand-offs written while building) and `reference/` (the original company brief, in Portuguese).
- **[`docs/business-plan/`](docs/business-plan/README.md):** the investor-style **business plan (PDF, pt-BR)** built around Challenge 3, its HTML source, platform screenshots, and the **5-minute pitch script** with live demo, fallbacks and Q&A prep. Shows the problem with sourced data, how each product decision answers it, a pilot design to measure it, market, competition and roadmap. The ask, team and traction are left for the founder to fill in.

## Prompts (`prompts/`)

Three different things live here; only the first is read by the product.

1. **Tutor prompts (loaded at runtime):** `base.md` (pedagogy, hints, citations, safety, always answer in pt-BR), `subjects/*.md` (one profile per subject; adding `subjects/<key>.md` adds a subject with no code change), `analysis.md` and `exercises.md` (post-session analysis and exercise lists). Written in English; edit them without touching code, then rerun the fixed test conversations.
2. **`sessions/` (logs, not loaded):** one folder per workstream (teacher interface, whiteboard front-end, whiteboard back-end, business plan) with the prompts each person sent to their agent, verbatim, plus an index.
3. **`founder-conversation/` (requirements, not loaded):** the founder's original instructions, merged requirements and traceability to the docs. Check it when intent is unclear.

## Working in parallel

Three people work in separate lanes with explicit ownership by directory: **1** teacher interface, data and insights; **2** whiteboard front-end; **3** whiteboard back-end. See [`workstreams/README.md`](workstreams/README.md) and [`docs/17-work-split.md`](docs/17-work-split.md). Contracts in `packages/contracts` are the shared interface between lanes. Rules, commit style and review: [`docs/14-working-rules.md`](docs/14-working-rules.md).

## Principles

The tutor cites its source and flags answers outside the material · the AI suggests, **the teacher decides** · no "learning styles" and no psychological inferences about students (they may be minors, LGPD) · simulated data always carries a visible badge · secrets live only in `.env` · no claims about customers, revenue or efficacy that do not exist.
