# @mento/board

Board renderer, action queue, SSE client, speech queue. Client-safe only.

- **Owner:** Person 2
- **Allowed workspace deps:** @mento/contracts, @mento/ui (see docs/21-repo-structure.md §4)
- Import from `@mento/board` only; no deep imports.

## Turn protocol mirror and mock mode

- `src/protocol.ts`: local mirror of Person 3's planned `@mento/contracts` (PR #5, plan wb-1: citation, actions, speech, stream, events, fixtures). Same names, shapes and limits; delete it and import from `@mento/contracts` once that lands. The start-screen shapes at the end (`StudentSummary`, `MaterialSummary`, `CreateSessionRequest`…) are Person 1's and not in PR #5.
- `fixtures/*.json`: Rome turns in the `FixtureTurn` format (`{ description, messages: [{ at_ms, message }] }`, fictional pt-BR content): `rome-intro`, `click-and-ask`, `wrong-answer`, `outside-material`. Validated in `src/protocol.test.ts`.
- `src/mock/`: `MOCK_STUDENTS`, `MOCK_MATERIALS`, `FIXTURE_TURNS`, `pickFixture(req, turnIndex)` and `replayFixture(name, { signal })` (honors `at_ms`; returns quietly on abort).
- `apps/web/src/lib/api.ts` replays the fixtures when `NEXT_PUBLIC_MOCK_API=1` is set in the root `.env`.
