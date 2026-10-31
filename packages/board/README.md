# @mento/board

Board renderer, action queue, SSE client, speech queue. Client-safe only.

- **Owner:** Person 2
- **Allowed workspace deps:** @mento/contracts, @mento/ui (see docs/21-repo-structure.md §4)
- Import from `@mento/board` only; no deep imports.

## Contracts and mock mode

- Every turn, stream, session, subject and event shape is imported from `@mento/contracts`. Only `StudentSummary` and the mock students stay local (`src/mock/`) until Person 1's students contract lands.
- `src/mock/`: `MOCK_STUDENTS` (first: the demo student `demo-ana`, "Ana S."), `MOCK_SUBJECTS`, `FIXTURE_TURNS` (the repo's `fixtures/turns/*.json`, the same files `GET /api/dev/fixture-turn` serves), `pickFixture(turnIndex)` (rome-intro, click-and-ask, again), `namespaceFixtureMessage(message, round)` (fixtures reuse ids: from round 1 on every id gets `_r<round>` so replays never collide; `audio_url` untouched) and `replayFixture(name, { signal, speed, round })` (honors `at_ms × speed`; returns quietly on abort).
- `src/replay/`: `replayEvents(events)` rebuilds a reopened session (`GET /api/sessions/:id`): actions in event order (`Action.safeParse`, invalid skipped), transcript, open verification, last turn id and the `tutor_action` count (zero: send the opening turn).
- `apps/web/src/lib/api.ts` runs everything locally with `NEXT_PUBLIC_MOCK_API=1`, or takes turns from the fixture route with `NEXT_PUBLIC_TURN_SOURCE=fixture`.

## Board core (T2 + T3)

| Folder | What |
|---|---|
| `src/store/` | `BoardState` (elements by id + per-column order), pure `applyAction(state, action)` and `applySvg` (streamed drawings), `createBoardStore` with per-element / per-column subscriptions, `useBoardElement` / `useBoardColumn`. Element types: text, timeline, image, svg, question. Unknown target ids never throw: they go to `onWarning`. |
| `src/sanitize/` | DOMPurify allowlists: `sanitizeHtml` (h1–h3, p, b, i, br, ul, ol, li, span; no attributes) and `sanitizeSvg` (basic shapes, presentational attributes, no `url(`). Returns `""` without a DOM. Student text is rendered as text, never through here. |
| `src/speech/` | `SpeechClock` + `TextSpeechPlayer` (text mode: reading time ~15 chars/s, 1.2–8 s; `progress`/`pause`/`resume`). In voice mode the queue plays `speak.audio_url` as given through the contracts' `SpeechPlayer` (`audio` option); if that audio fails (404/503) the line falls back to the text clock. |
| `src/queue/` | `createActionQueue` over `StreamMessage`: plays strictly by `order`; `speak` gates, `draw` does not. `script_done` ends the script (state → idle or waiting_answer); late actions (`draw_result`) still play until `turn_done`. `svg_chunk`s (200 KB cap per element) are applied on `turn_done`. `speech_alignment` is kept per action (`onAlignment`, `getAlignment`). `error` → `onError({ code, message, recoverable })`; non-recoverable ends the turn. `pause`/`resume`; synchronous `interrupt()` → `{ turn_id, action_id?, spoken_ms?, spoken_chars? }`, using the previous turn's id until the current one arrives with `script_done` (null only before the first; `setLastTurnId` seeds it for a reopened session). Override a handler with `handlers: { name: fn }`; add an animation with `reveal: { write_text: hook }`. |
| `src/renderers/` | `basicRenderers` per element type; replace one with `{ ...basicRenderers, text: MyText }` passed to `<Board renderers>`. Image URLs must be http(s) on `assetBaseUrl`'s origin. |
| `src/board/` | `<Board store assetBaseUrl>`: columns main / visuals / side, memoized `ElementFrame` (`data-element-id`, `data-element-type`, `tabIndex=0`), auto-scroll to the newest element (paused 4 s after manual scroll). |
| `src/session/` | `useTurnPlayer({ sessionId, streamTurn })` (`streamTurn(id, req, onMessage, { signal })`, same as the web API client): one store + queue; `sendTurn` cuts any running turn and sends `interrupted`; `restore(actions, lastTurnId)` redraws a reopened session without animation or audio. A cut turn whose script was done keeps its stream open only to deliver late `draw_result`s. |

Try it: `/dev/board` replays each fixture locally (no API needed).

Tests: `pnpm --filter @mento/board test`. The sanitizer test runs in jsdom, not happy-dom: happy-dom's `NodeIterator` stops after the current node is removed, so DOMPurify output there is wrong (scripts survive).
