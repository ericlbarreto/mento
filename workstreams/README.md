# Workstreams — how the 3 people split the work

> Status: **proposed final split, 2026-10-30** (founder's request). This folder is the **single place** that shows who does what. It refines and, where they differ, **replaces** the lane descriptions in `docs/17-work-split.md` (Lane A → Person 2, Lane B → Person 3, Lane C → Person 1, with voice moved to Person 3). Names are not assigned yet (`docs/10-decisions.md`, Q9).

## The three people

| # | Workstream | One-line mission | Detailed plan |
|---|---|---|---|
| **1** | **Teacher interface + data + insights** | Everything the teacher sees and the data behind it: Students and Materials tabs, class context, database, material ingestion, and the pipeline that turns whiteboard conversations into **insights** | [`01-teacher-interface.md`](01-teacher-interface.md) |
| **2** | **Whiteboard front-end** | The student experience: the live board, element identification and circling, click-and-ask, fluid animations with the mascot, the orb, answering/interrupting, sources and PDF viewer | [`02-whiteboard-frontend.md`](02-whiteboard-frontend.md) |
| **3** | **Whiteboard back-end** | The tutor's brain and plumbing: prompts, LLM orchestration with low latency, drawing pipelines, judge/evidence, **STT/TTS integration**, API calls, and delivering the data to the teacher side | [`03-whiteboard-backend.md`](03-whiteboard-backend.md) |

The seams between the three are in [`handoffs-and-insights-pipeline.md`](handoffs-and-insights-pipeline.md), including the full **conversation → insight → teacher screen** pipeline. **Every shared shape is defined once in [`contracts-spec.md`](contracts-spec.md)**; if any document disagrees with it, the spec wins.

## Why this split works in parallel

- **Each person has their own packages and routes** (monorepo, `docs/21-repo-structure.md`), so nobody edits the same files.
- **They talk only through frozen contracts** (Zod schemas + a few interfaces) and **mocks**: Person 2 builds against a fixture stream, Person 3 builds against an in-memory repository and a CLI, Person 1 builds against fixture event logs. Nobody waits for anyone.
- **Must first.** Everyone's order is Must → Should → Nice; the **cut line is hour 18**.

## Who owns which scope item (`docs/01-hackathon-scope.md`)

| Scope item | P1 Teacher | P2 Front | P3 Back |
|---|---|---|---|
| Must 1 Whiteboard writes/draws live | — | **render** | **script + drawing** |
| Must 2 Two-way chat + click-and-ask | — | **UI + events** | **turn loop** |
| Must 3 Layered prompt (class context, grade level) | provides class context + learner summary | — | **owner** |
| Must 4 Materials ingestion, retrieval, citations | **ingestion, search, citation validator** | chips | uses search in the turn |
| Must 5 Source chips + PDF at the quote | — | **owner** | emits `sources` |
| Must 6 Evidence recording | storage | answer UI | **judge + `record_evidence`** |
| Must 7 Conversations + event log persisted | **repository/DB** | — | **writes events** |
| Must 8 Students + class context + start screen | **seed, APIs** | **start screen** | — |
| Should 9 Teacher interface (Students, class context, Materials) | **owner** | — | — |
| Should 10 Post-session analysis → insights | **owner** | — | emits `session_ended` |
| Should 11 Voice (STT/TTS) | — | player UI + orb | **owner (server + client hooks)** |
| Visual direction (beige + Mento blue + mascot) | uses it | **owner of the design system** | — |

## Path ownership (monorepo)

| Path | Owner |
|---|---|
| `apps/web/src/app/(teacher)/**`, API routes in `apps/api/src/routes/` (`students`, `sessions`, `overview`, `class-context`, `insights`, `materials`, `files`, `teacher-stream`, `dev-analyze`), `packages/db/**`, `packages/sources/**`, `packages/analysis/**`, `scripts/seed.ts`, `scripts/ingest.ts` | **Person 1** |
| `apps/web/src/app/(student)/**`, `apps/web/src/lib/api.ts`, `packages/board/**`, `packages/ui/**`, `apps/web/public/brand/**` | **Person 2** |
| `packages/tutor/**`, `packages/voice/**`, `prompts/**`, API routes `apps/api/src/routes/turn.ts`, `voice.ts`, `dev-fixtures.ts`, `scripts/turn-cli.ts`, `scripts/pregenerate-images.ts` | **Person 3** |
| `packages/contracts/**` | **Shared, frozen after kickoff** (additive PRs; message the other two) |
| `apps/api/src/server.ts`, `container.ts`, `plugins/**`, `config.ts` (small additive edits; Person 3 creates the skeleton at K1), root configs, `fixtures/` (add new files only), `docs/` (the owner of the behavior updates the doc), `assets/` (founder) | Shared / founder |

## Why we agree on schemas (the contracts) and why it prevents conflicts

The contracts are **not extra work between people; they are what lets you not talk to each other**. Everyone builds against the *shape* of the data, not against someone else's code:

- **Front-end (P2) and back-end (P3) never wait for each other.** The turn stream has a fixed shape (the actions: `speak`, `write_text`, `draw`, …). P2 builds the whole board from **fixture files** with that shape; P3 builds the tutor and checks its output with the **same schemas**. On integration day (H8) the real stream drops in and works because both sides already agree.
- **The teacher side (P1) never waits for the whiteboard.** The events and evidence rows have a fixed shape, so P1 builds and tests the analysis and the Students tab on a **fixture event log** before any real conversation exists.
- **Mistakes show up immediately and at the right place.** Each schema is checked in code (Zod): if P3 emits an action the board does not know, the test fails in P3's code, not as a mystery bug in P2's UI during the demo.
- **Fewer merge conflicts.** The shared agreement lives in **one frozen package** (`packages/contracts`). Nobody edits each other's files; they only *read* the contract. Changing it is rare and additive (message the others first).
- **It is small and done once:** about 90 minutes at kickoff, together. Without it, each person guesses the others' formats and the surprises all land at integration time.

Analogy: it is the **plug standard** between three appliances built in different rooms. You do not need the other room to build yours, but all three must fit the same socket.

## Timeline and checkpoints (all three)

| Hour | Checkpoint | What happens |
|---|---|---|
| 0–1.5 | **Kickoff together** | Repo skeleton (K1), contracts (K2–K6), fixtures (K7), design tokens + brand copy (K9). Nothing else starts before this |
| ≤ 3 | **Repository swap** | P1 delivers the SQLite repository; P3 switches from the in-memory stub |
| **8** | **Integration 1** | P2 switches from fixtures to P3's real `/turn`; a real text turn works end to end |
| **14** | **Integration 2** | Citations (P1 validator ↔ P3 ↔ P2 chips) and evidence (P3 → P1 → teacher card) work end to end |
| **18** | **Cut line / Must demo** | Full Rome demo run by all three; if Must is not green, Should does not start |
| 22 | **Feature freeze** | Bug fixes only; two rehearsals |

## Estimated load (rough, unverified)

| Person | Must | Should | Notes |
|---|---|---|---|
| P1 | ~12.5 h | ~19.5 h | Heaviest Should; follow the **cut order** in `docs/01-hackathon-scope.md` |
| P2 | ~27 h | ~6 h (animation polish) | Heaviest Must; the orb and animations can slip to Should |
| P3 | ~21 h | ~10 h (voice, SVG) | Latency work is continuous |

## Working agreement

- **Quality first, budget is not the constraint:** the founder pays for all services. Still log cost per session; model choices follow quality and latency (bake-offs on day 0).
- **UI persons (P1 and P2) use the `impeccable` skill** for all interface work, with the shared tokens in `packages/ui` (`docs/18-ui-references.md` §6). *Note: this skill was **not found** in the plugin/skill catalogs available to the assistant on 2026-10-30; install it from its source (founder to provide) or fall back to Anthropic's `frontend-design` skill.*
- **AI agents:** start with *"Study the repository"*, then tell the agent *"I am Person N; read `workstreams/0N-….md` and edit only my paths."*
- **Small PRs, rebase often, no secrets** (`docs/14-working-rules.md`).
- **Update the docs** with your change (behavior owner updates the relevant doc).

## Quick start per person

1. Read `docs/00`, `01`, `10`, `14`, then **your workstream file** and `handoffs-and-insights-pipeline.md`.
2. Do the **kickoff** items together (`docs/17-work-split.md` §3 and `docs/21-repo-structure.md` §10).
3. Do your **day-0 checks** (listed in your file), then your tasks in the order given.
4. **Start your agent session with your starter prompt** (`prompts/sessions/0N-…/00-starter-prompt.md`) and **log your prompts** in that folder (`prompts/sessions/README.md`).
