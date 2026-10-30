# 2026-10-30 21:00 — Wave 2: board core, start screen, orb

- **Person / agent:** Person 2 (Robério) / Claude Code (orchestrator + implementer, security-reviewer and ui-reviewer subagents, `prd-waves`)
- **Task id** (from your workstreams file): T2, T3 (board core), T8 (start screen), T10 (orb)
- **Docs read first:** workstreams/02-whiteboard-frontend.md, workstreams/contracts-spec.md, docs/16 §3–5, docs/18 §3 and §6, docs/19 §4

## Prompt (verbatim)

```text
siga
```

(Approval of the wave plan from the wave 1 entry; execution scope: waves 1 and 2 only, one PR per track, no merge.)

## Outcome (English, 3–5 lines)

Three parallel tracks stacked on `feat/p2-wave1-base` (= PR #1 + #2): (C) board store/reducer, DOMPurify allowlist sanitizer, ordered action queue with interrupt/pause, text-only SpeechPlayer, columns + basic renderers, `useTurnPlayer`, `/session/[id]` and `/dev/board`; (D) start screen (student → material → topic → createSession) and `EndSessionControls` (manual end, idle timeout, beacon); (E) mascot orb with stacked GIFs and a code-drawn ring. Independent security review on C (3 🟡 fixed: image origin policy, no attributes on model HTML, topic not sent as student chat) and UI review on D/E (no blockers; suggestions applied).

## Files changed

- C: `packages/board/src/{store,sanitize,queue,speech,renderers,board,session}/**`, `apps/web/src/app/(student)/session/[id]/**`, `apps/web/src/app/(student)/dev/board/**`, `apps/web/src/lib/api.ts` (internal refactor)
- D: `apps/web/src/app/(student)/{page.tsx,ApiStatus.tsx,_components/start/**,session/_components/**,dev/session-controls/**}`
- E: `packages/ui/src/orb/**`, `packages/ui/src/components/Card.tsx`, `apps/web/src/app/(student)/dev/orb/**`

## Decisions and contracts touched

- No change to `packages/contracts`. `SpeechPlayer` mirror gained optional `progress()`, `pause()`, `resume()` (proposal for Person 3).
- Generated images are accepted only from the API origin (`assetBaseUrl`); Person 3 must serve `draw_result.url` from the API (or we widen the base).
- The session topic travels only via `createSession`; the first turn sends a fixed "Vamos começar!".

## Follow-ups / questions for other people

- Person 3: `{turn_id}` first stream message is required for `interrupted`; `ask_verification` needs `id` + `verification_id`; serve generated images from the API origin.

## Commit / PR

- C, D (#3), E (#4): draft PRs on `feat/p2-wave1-base`
