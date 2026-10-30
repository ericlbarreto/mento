# @mento/board

Board renderer, action queue, SSE client, speech queue. Client-safe only.

- **Owner:** Person 2
- **Allowed workspace deps:** @mento/contracts, @mento/ui (see docs/21-repo-structure.md §4)
- Import from `@mento/board` only; no deep imports.

## Turn protocol mirror and mock mode

- `src/protocol.ts`: local Zod mirror of the turn protocol and start-screen shapes (docs/16 §3–4, workstreams/contracts-spec.md). Strict, snake_case, closed enums. Shapes marked `PROPOSAL` are not in the spec yet (`turn_id` / `error` stream messages, `ask_verification.id/verification_id/choices`, `MaterialSummary` fields). Person 3 can move these into `@mento/contracts`.
- `fixtures/*.json`: Rome turn scripts (arrays of `TurnStreamMessage`, fictional pt-BR content), validated in `src/protocol.test.ts`.
- `src/mock/`: `MOCK_STUDENTS`, `MOCK_MATERIALS`, `FIXTURE_TURNS` and `pickFixture(req, turnIndex)`.
- `apps/web/src/lib/api.ts` replays the fixtures when `NEXT_PUBLIC_MOCK_API=1` is set in the root `.env`.
