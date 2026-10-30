# 14 — Working rules

> How the three of us (and our AI agents) work in parallel. Last updated: 2026-10-30.

## Principles

1. **Scope first.** `01-hackathon-scope.md` decides what gets built. Propose changes there before building something new.
2. **Contracts before code.** Lanes talk through the shared contracts in `packages/contracts` (action/tool schema, SSE message and event log shapes, citation format, `Repository` and `SpeechPlayer` interfaces). They are frozen after kickoff; change them only additively, with a message to the team and an update to the docs.
3. **Small and shippable.** Prefer a thin end-to-end slice over a perfect part. The cut line at ~hour 18 is real.
4. **No over-engineering.** No new abstractions, services or dependencies without a concrete need in the demo.

## Language

Repository content (code, comments, commits, docs, prompt instructions, file names) in **English**. Product content (UI, tutor replies, demo materials) in **pt-BR**. See `AGENTS.md`.

## Lanes and ownership

The three lanes, directory ownership, frozen contracts and integration checkpoints are defined in `17-work-split.md`. Those rules take precedence over the general guidance below.

## Repository

- **Remote:** https://github.com/ericlbarreto/mento (default branch `main`).
- The repo contains documentation, prompts and brand assets; code arrives after the kickoff (`17-work-split.md`).
- `materials/*` PDFs, `.env` and databases are git-ignored (`.gitignore`); `assets/` (brand files, ~8 MB) **is** committed.
- Clone: `git clone https://github.com/ericlbarreto/mento.git`.

## Git

- Branch per task: `feat/<lane>-<short-name>`, e.g., `feat/a-click-and-ask` (lane letters from `17-work-split.md`).
- Small commits, imperative English messages: `Add action schema validation`.
- Pull/rebase from `main` often; merge early and often to avoid late conflicts.
- Never commit secrets, `.env`, PDFs under `materials/`, or databases.
- Do not force-push shared branches.

## Working with AI agents

- Start sessions with *"Study the repository"*; the agent follows `AGENTS.md`.
- Tell the agent which lane you own and which files it may touch; avoid two agents (or people) editing the same files.
- Ask agents to update the relevant doc in the same change when they alter behavior or decisions.
- Treat agent output as a draft: run it, test the demo flow, read the diff.

## Testing and demo discipline

- Keep a small set of fixed Rome-material test conversations (wrong answer, click-and-ask, out-of-material question) and rerun after prompt changes.
- Test PDFs for selectable text early.
- Pre-generate and cache demo illustrations.
- Rehearse the demo end to end at least twice before the freeze; keep text mode as fallback.
- Cost awareness: track LLM/voice spend during testing; prefer cheap models in development.

## Data rules

- Only fictional or team-member data for students.
- Simulated data always shows the "simulated data" badge.
- No real children's data in any environment.

## Documentation upkeep

- Decision made → `10-decisions.md`.
- Scope changed → `01-hackathon-scope.md`.
- New term → `12-glossary.md`.
- Stack chosen → `07-architecture-and-data.md`, `13-technical-discovery-and-split.md`, and the repo map in `AGENTS.md`.
- Mark claims as **[Decision]**, **[Hypothesis]**, **[Verified]**, **[Unverified]** or **[Out of scope]**; date any external facts.
