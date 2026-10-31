# AGENTS.md — Mento

> Entry point for any AI agent (Claude Code, Codex, Cursor, etc.) and for anyone new to this repository.
> If the user says **"Study the repository"** (or "Estude o repositório"), follow [How to study this repository](#how-to-study-this-repository).

## Language policy

- **Everything in the repository is written in English**: code, comments, commit messages, documentation, prompts' *instructions*, file names.
- **The product itself is in Brazilian Portuguese (pt-BR)**: UI text, tutor replies, demo content, teaching materials.
- The founder and team chat in Portuguese. In chat, reply in the user's language, but **write all repo files in English**.
- The tutor's system prompts are written in English and instruct the model to **always answer the student in pt-BR**.

## What Mento is (in 5 lines)

**Mento** is an AI tutoring platform for schools. The teacher uploads **materials** (PDFs such as books) and describes the **class** (grade level and characteristics) in a simple single-teacher workspace (no login), and manages **students**. Each student talks to an AI tutor that **writes and draws live on a whiteboard**, converses by text (and by voice if time allows), and **answers grounded in the teacher's materials, citing the source**. Each conversation is stored; an automatic analysis turns it into **insights** (gaps, progress, suggestions) so the teacher sees, per student, how they are evolving.

Thesis: *the school defines what must be learned; Mento teaches each student individually and turns the evidence from those tutoring sessions into pedagogical intelligence for the teacher.*

## Current context (important)

- **Stage:** ideation/prototype for a **2-day hackathon backed by Teachy**. ~24h of build time, then code freeze.
- **Team:** 3 people working in parallel in this repo (https://github.com/ericlbarreto/mento).
- **Demo:** **History — Ancient Rome**, taught from a book PDF uploaded by the teacher to a class described as **8º ano (Ensino Fundamental II)**; content in Portuguese; no math in the demo. **MVP segment focus: 7º, 8º and 9º ano.**
- **Product model:** one teacher workspace (no auth); entities **Students** and **Materials**; one global **class context**; see `docs/01-hackathon-scope.md` and `docs/06-teacher-interface.md`.
- **Stack (decided):** TypeScript, a light pnpm-workspace **monorepo**: `apps/web` (Next.js, frontend only), `apps/api` (**Fastify** backend: SSE/real-time), `packages/*`, Zod contracts, MongoDB (Mongoose). Layout: `docs/21-repo-structure.md`. See `docs/16-technical-roadmap.md` and `docs/17-work-split.md`.
- There are **no** paying customers, proven efficacy or closed partnerships. Never present these as facts.

## How to study this repository

Read in this order. Stop when you have enough context for the task, but **always read 1 to 4**.

1. `docs/00-product-vision.md` — what it is, for whom, why.
2. `docs/01-hackathon-scope.md` — **what we build and what we do NOT build** (Must / Should / Nice / Out). Source of truth for scope.
3. `docs/10-decisions.md` — decisions made and open questions.
4. `docs/14-working-rules.md` — how we work in parallel.
5. Then, depending on the task:
   - Whiteboard and student experience → `docs/02-student-experience-whiteboard.md`
   - Tutor and prompts → `docs/03-tutor-and-prompts.md`
   - PDFs, retrieval, citations → `docs/04-knowledge-and-sources.md`
   - Student model, evidence, analysis → `docs/05-learner-model-and-analysis.md`
   - Teacher interface (students, materials, class context, insights) → `docs/06-teacher-interface.md`
   - **Per-person prompt logs and ready-to-paste starter prompts** → `prompts/sessions/` (one folder per workstream)
   - **The founder's original instructions (verbatim prompts, merged requirements, traceability)** → `prompts/founder-conversation/` (start with `consolidated-requirements.md`; check it when intent is unclear)
   - Architecture, database, events, voice → `docs/07-architecture-and-data.md`
   - Privacy, ZDR, minors → `docs/08-privacy-zdr-security.md`
   - Market, Teachy, competitors → `docs/09-market-and-competitors.md`
   - Researched prices and technologies → `docs/11-technology-research.md`
   - Vocabulary → `docs/12-glossary.md`
   - How a competing whiteboard tutor works (tool calls, drawing pipelines, voice) → `docs/15-studdy-teardown.md`
   - **Technical build plan (protocol, tools, board, order of work)** → `docs/16-technical-roadmap.md`
   - **Who owns what, lanes, contracts, checkpoints** → `docs/17-work-split.md`
   - **UI references, shared design language, orb and teacher layout** → `docs/18-ui-references.md`
   - **Logo, mascot, brand colors and how the orb uses them** → `docs/19-brand-assets.md`
   - **Demo preparation, script and fallbacks** → `docs/20-demo-runbook.md`
   - **Monorepo layout, packages, dependency rules, K1 checklist** → `docs/21-repo-structure.md`
   - **Who does what (3 people), handoffs, the insights pipeline** → `workstreams/README.md` (then your own `workstreams/0N-….md`); **shared data shapes** → `workstreams/contracts-spec.md` (canonical)
6. Original raw material: `docs/reference/Mento_Company_Brief.md` (long brief, **in Portuguese**; also contains long-term vision and out-of-scope items).

When done studying, answer the user with: (a) product summary, (b) hackathon scope, (c) open decisions, (d) what you understand still needs to be done.

## Repository map

```
AGENTS.md                  ← you are here (entry point for agents)
CLAUDE.md                  ← points to this file
README.md                  ← short intro for humans
workstreams/               ← division of work among the 3 people (one file per person + handoffs and the insights pipeline)
docs/                      ← all product and technical documentation (numbered)
  reference/               ← original raw material (Portuguese brief)
prompts/                   ← tutor prompts as editable text files; founder-conversation/ = the founder's prompts and requirements (not loaded by the tutor)
  base.md                  ← base tutor prompt (loaded by packages/tutor)
  subjects/                ← one profile per subject key (history.md, generic.md; math.md not written yet)
materials/                 ← sample PDFs for the ingestion script (git-ignored)
apps/web/                  ← Next.js frontend only (no API routes)
apps/api/                  ← Fastify API service: routes, SSE, jobs; the only composition root
packages/                  ← contracts, ui, board, tutor, db, sources, analysis, voice (see docs/21-repo-structure.md)
scripts/ fixtures/         ← tsx scripts; JSON fixtures validated against the contracts
assets/                    ← brand source files: brand/ (logo.png, mascot.png) and brand-concepts/ (founder-owned; see assets/README.md)
```

The **K1 skeleton exists** (`pnpm install && pnpm dev`; web :3000, API :4000; MongoDB at `MONGODB_URI`); features are not built yet. Monorepo layout: `docs/21-repo-structure.md` and the **directory ownership per lane** in `docs/17-work-split.md` (§7) and `docs/21-repo-structure.md` (§9). Keep this map in sync.

**If you are an agent working for one person:** ask which person they are — **1 Teacher interface + data + insights**, **2 Whiteboard front-end**, **3 Whiteboard back-end** — read `workstreams/README.md` and their file `workstreams/0N-….md`, and only edit that person's paths (ownership tables in `workstreams/README.md` and `docs/21-repo-structure.md` §9).

## Rules that always apply

1. **Scope rules.** Before proposing anything large, check `docs/01-hackathon-scope.md`. If it is not in Must/Should, do not build it without approval.
2. **No over-engineering.** Few tables, JSON where flexible, prompts as text files, no orchestration frameworks, no abstractions for a hypothetical future. We have ~24h.
3. **Do not invent facts.** Metrics, customers, competitor features and prices only with a source and a date. Mark what is unverified.
4. **Simulated data always carries a visible badge** ("simulated data"). Never present invented data as real evidence of efficacy.
5. **No "learning styles"** (visual/auditory, etc.). They lack scientific support. The student profile records *what worked on tasks*, with `n` and uncertainty.
6. **No psychological or sensitive inferences** about students (attention, anxiety, personality). Educational evidence only. Students may be minors (LGPD).
7. **The tutor cites its source** when using teacher material and **flags** answers given outside the material.
8. **The teacher decides.** The AI suggests; it never automates high-impact pedagogical decisions.
9. **Secrets never go in the repo.** Keys live in `.env` (git-ignored).
10. **Document decisions.** Changed something relevant? Update `docs/10-decisions.md` and the topic doc.

## How to respond in this project

- Be direct and give a recommendation, not an exhaustive list of options.
- Always distinguish: **decision**, **hypothesis**, **verified fact**, and **out of scope**.
- Real product doubt → ask the founder. Doubt that code or docs can answer → answer it yourself.

## Shortcut phrases for the user

| When the user says... | The agent should... |
|---|---|
| "Study the repository" / "Estude o repositório" | Follow [How to study](#how-to-study-this-repository) and summarize |
| "Read `<file>`" / "Leia `<arquivo>`" | Read it, explain it, relate it to the scope |
| "What's left to do?" | Compare the current code with `docs/01-hackathon-scope.md` |
| "Update the decisions" | Edit `docs/10-decisions.md` |
