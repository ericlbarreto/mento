# Person 3 — Whiteboard back-end (tutor, STT/TTS, orchestration): prompt sessions

> Part of `prompts/sessions/` (see `../README.md`). **Plan:** `workstreams/03-whiteboard-backend.md` · **Shared shapes:** `workstreams/contracts-spec.md` · **Pipeline and handoffs:** `workstreams/handoffs-and-insights-pipeline.md`.

## Scope in one paragraph

You own: `packages/tutor/**`, `packages/voice/**`, `prompts/**` (runtime tutor prompts), API route files `turn.ts`, `voice.ts`, `dev-fixtures.ts` in `apps/api/src/routes/`, the API skeleton at kickoff (`apps/api/src/server.ts`, SSE helper), `scripts/turn-cli.ts`, `scripts/pregenerate-images.ts`.

## Read first

`AGENTS.md`, `workstreams/README.md`, `workstreams/contracts-spec.md`, `workstreams/handoffs-and-insights-pipeline.md`, `docs/01-hackathon-scope.md`, `docs/10-decisions.md`, `docs/14-working-rules.md`, `workstreams/03-whiteboard-backend.md`, `docs/03-tutor-and-prompts.md`, `docs/11-technology-research.md` (voice, TTS), `docs/15-studdy-teardown.md`, `docs/16-technical-roadmap.md`, `docs/21-repo-structure.md` (§5 API service).

## First steps

day-0 checks (LLM tool-call speed and reliability; image-model bake-off; TTS bake-off with the 4 pt-BR lines; Deepgram token + WebSocket), then T2 (`turn-cli` + fixture recorder + `/api/dev/fixture-turn`) so Person 2 can build against fixtures by hour ~3.

Follow `contracts-spec.md` exactly: event names (§3), evidence `result` and `hints_used` (§5), hint signalling (§6) and the concept label rules (§7). The founder pays for all services, so choose models by quality and latency.

## What to test and log

`turn-cli` scripts for the five scenarios, the latency report, and the **round-trip contract test** from `contracts-spec.md` §10. Log the prompts that produced each piece of work in this folder (`../README.md` explains how).

## Rules

- Edit **only your paths** (`workstreams/README.md`, `docs/21-repo-structure.md` §10); ask the owner for anything else.
- Never rename a shared field; contract changes are additive, in `contracts-spec.md` and `packages/contracts` together, after a message to the other two.
- Small PRs, rebase often, no secrets.
