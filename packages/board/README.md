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

## Board core (T2 + T3)

| Folder | What |
|---|---|
| `src/store/` | `BoardState` (elements by id + per-column order), pure `applyAction(state, action)`, `createBoardStore` with per-element / per-column subscriptions, `useBoardElement` / `useBoardColumn`. Unknown target ids never throw: they go to `onWarning`. |
| `src/sanitize/` | DOMPurify allowlists: `sanitizeHtml` (h1–h3, p, b, i, br, ul, ol, li, span; `class` only) and `sanitizeSvg` (basic shapes, presentational attributes, no `url(`). Returns `""` without a DOM. Student text is rendered as text, never through here. |
| `src/speech/` | `SpeechPlayer` (handoffs §2 mirror + optional `progress`/`pause`/`resume`) and `TextSpeechPlayer` (reading time ~15 chars/s, 1.2–8 s). |
| `src/queue/` | `createActionQueue`: plays strictly by `order`, `speak` gates, `draw` does not, svg chunks applied on `draw_result` or `done`, `pause`/`resume`, synchronous `interrupt()` → `Interrupted` payload. States: idle, thinking, playing, waiting_answer, paused. Override a handler with `handlers: { name: fn }`; add an animation with `reveal: { write_text: hook }`. |
| `src/renderers/` | `basicRenderers` per element type; replace one with `{ ...basicRenderers, text: MyText }` passed to `<Board renderers>`. |
| `src/board/` | `<Board store>`: columns main / visuals / side, memoized `ElementFrame` (`data-element-id`, `data-element-type`, `tabIndex=0`), auto-scroll to the newest element (paused 4 s after manual scroll). |
| `src/session/` | `useTurnPlayer({ sessionId, streamTurn })`: one store + queue; `sendTurn` cuts any running turn and sends `interrupted`. |
| `src/mock/` | `replayFixture(messages, signal)`: fixture replay with realistic timing (also used by `apps/web/src/lib/api.ts`). |

Try it: `/dev/board` replays each fixture locally (no API needed).

Tests: `pnpm --filter @mento/board test`. The sanitizer test runs in jsdom, not happy-dom: happy-dom's `NodeIterator` stops after the current node is removed, so DOMPurify output there is wrong (scripts survive).
