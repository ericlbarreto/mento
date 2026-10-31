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

## Board core (T2 + T3)

| Folder | What |
|---|---|
| `src/store/` | `BoardState` (elements by id + per-column order), pure `applyAction(state, action)` and `applySvg` (streamed drawings), `createBoardStore` with per-element / per-column subscriptions, `useBoardElement` / `useBoardColumn`. Element types: text, timeline, image, svg, question. Unknown target ids never throw: they go to `onWarning`. |
| `src/sanitize/` | DOMPurify allowlists: `sanitizeHtml` (h1–h3, p, b, i, br, ul, ol, li, span; no attributes) and `sanitizeSvg` (basic shapes, presentational attributes, no `url(`). Returns `""` without a DOM. Student text is rendered as text, never through here. |
| `src/speech/` | `SpeechClock` + `TextSpeechPlayer` (text mode: reading time ~15 chars/s, 1.2–8 s; `progress`/`pause`/`resume`). In voice mode the queue plays `speak.audio_url` through the protocol's `SpeechPlayer` (`audio` option). |
| `src/queue/` | `createActionQueue` over `StreamMessage`: plays strictly by `order`; `speak` gates, `draw` does not. `script_done` ends the script (state → idle or waiting_answer); late actions (`draw_result`) still play until `turn_done`. `svg_chunk`s (200 KB cap per element) are applied on `turn_done`. `speech_alignment` is kept per action (`onAlignment`, `getAlignment`). `error` → `onError({ code, message, recoverable })`; non-recoverable ends the turn. `pause`/`resume`; synchronous `interrupt()` → `{ turn_id, action_id?, spoken_ms?, spoken_chars? }`, or null while the turn id is unknown (it only arrives with `script_done`). Override a handler with `handlers: { name: fn }`; add an animation with `reveal: { write_text: hook }`. |
| `src/renderers/` | `basicRenderers` per element type; replace one with `{ ...basicRenderers, text: MyText }` passed to `<Board renderers>`. Image URLs must be http(s) on `assetBaseUrl`'s origin. |
| `src/board/` | `<Board store assetBaseUrl>`: columns main / visuals / side, memoized `ElementFrame` (`data-element-id`, `data-element-type`, `tabIndex=0`), auto-scroll to the newest element (paused 4 s after manual scroll). |
| `src/session/` | `useTurnPlayer({ sessionId, streamTurn })`: one store + queue; `sendTurn` cuts any running turn and sends `interrupted`. A cut turn whose script was done keeps its stream open only to deliver late `draw_result`s. |

Try it: `/dev/board` replays each fixture locally (no API needed).

Tests: `pnpm --filter @mento/board test`. The sanitizer test runs in jsdom, not happy-dom: happy-dom's `NodeIterator` stops after the current node is removed, so DOMPurify output there is wrong (scripts survive).
