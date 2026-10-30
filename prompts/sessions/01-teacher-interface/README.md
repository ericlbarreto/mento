# Person 1 — Teacher interface + data + materials + insights: prompt sessions

> Part of `prompts/sessions/` (see `../README.md`). **Plan:** `workstreams/01-teacher-interface.md` · **Shared shapes:** `workstreams/contracts-spec.md` · **Pipeline and handoffs:** `workstreams/handoffs-and-insights-pipeline.md`.

## Scope in one paragraph

You own: `apps/web/src/app/(teacher)/**`, API route files `students.ts`, `sessions.ts`, `overview.ts`, `class-context.ts`, `insights.ts`, `materials.ts`, `files.ts`, `teacher-stream.ts`, `dev-analyze.ts` in `apps/api/src/routes/`, `packages/db/**`, `packages/sources/**`, `packages/analysis/**`, `scripts/seed.ts`, `scripts/ingest.ts`.

## Read first

`AGENTS.md`, `workstreams/README.md`, `workstreams/contracts-spec.md`, `workstreams/handoffs-and-insights-pipeline.md`, `docs/01-hackathon-scope.md`, `docs/10-decisions.md`, `docs/14-working-rules.md`, `workstreams/01-teacher-interface.md`, `docs/04-knowledge-and-sources.md`, `docs/05-learner-model-and-analysis.md`, `docs/06-teacher-interface.md`, `docs/07-architecture-and-data.md`, `docs/18-ui-references.md` (§4 and §6), `docs/19-brand-assets.md`.

## First steps

day-0 checks (ingest a real book PDF and time it; MongoDB text index with Portuguese queries; analysis dry run on a fixture event log), then T1 (schema + MongoDB repository + seed, delivered by hour 3).

Use the `impeccable` skill for every screen (fallback: `frontend-design`).

## What to test and log

the ingestion/FTS check, the analysis dry run on a fixture event log, and the **round-trip contract test** from `contracts-spec.md` §10. Log the prompts that produced each piece of work in this folder (`../README.md` explains how).

## Rules

- Edit **only your paths** (`workstreams/README.md`, `docs/21-repo-structure.md` §10); ask the owner for anything else.
- Never rename a shared field; contract changes are additive, in `contracts-spec.md` and `packages/contracts` together, after a message to the other two.
- Small PRs, rebase often, no secrets.
