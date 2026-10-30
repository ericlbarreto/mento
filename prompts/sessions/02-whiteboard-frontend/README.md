# Person 2 — Whiteboard front-end (+ design system): prompt sessions

> Part of `prompts/sessions/` (see `../README.md`). **Plan:** `workstreams/02-whiteboard-frontend.md` · **Shared shapes:** `workstreams/contracts-spec.md` · **Pipeline and handoffs:** `workstreams/handoffs-and-insights-pipeline.md`.

## Scope in one paragraph

You own: `apps/web/src/app/(student)/**`, `apps/web/src/lib/api.ts`, `packages/board/**`, `packages/ui/**`, `apps/web/public/brand/**`.

## Read first

`AGENTS.md`, `workstreams/README.md`, `workstreams/contracts-spec.md`, `workstreams/handoffs-and-insights-pipeline.md`, `docs/01-hackathon-scope.md`, `docs/10-decisions.md`, `docs/14-working-rules.md`, `workstreams/02-whiteboard-frontend.md`, `docs/02-student-experience-whiteboard.md`, `docs/15-studdy-teardown.md`, `docs/16-technical-roadmap.md` (§3–5), `docs/18-ui-references.md` (§3 and §6), `docs/19-brand-assets.md`, `assets/README.md`.

## First steps

day-0 checks (handwriting font with pt-BR accents; circle-annotation prototype on wrapped text and KaTeX; mascot GIF stacking without flicker), then T1/T2 (tokens + brand copy, board skeleton) against the fixture stream.

Use the `impeccable` skill for the design system and every student screen (fallback: `frontend-design`); the interface is light beige with the Mento blue and the mascot GIFs.

## What to test and log

the action-queue test against a fixture, the circle-annotation cases, and interruption in under 100 ms. Log the prompts that produced each piece of work in this folder (`../README.md` explains how).

## Rules

- Edit **only your paths** (`workstreams/README.md`, `docs/21-repo-structure.md` §10); ask the owner for anything else.
- Never rename a shared field; contract changes are additive, in `contracts-spec.md` and `packages/contracts` together, after a message to the other two.
- Small PRs, rebase often, no secrets.
