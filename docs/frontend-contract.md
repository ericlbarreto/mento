# Front-end contract (Person 2 reads this)

> Source of truth in code: `@mento/contracts` (Zod). This page explains how to use it. Replay any turn without an LLM: `GET http://localhost:4000/api/dev/fixture-turn?name=rome-intro&speed=1` (`speed=0` is instant). Fixtures: `fixtures/turns/`.

## 1. Turn request: `POST /api/sessions/:id/turn`

Body = `TurnRequest`: `{ modality, appended: [...], interrupted?, client_timing? }`. `appended` is empty for the tutor's opening turn. Messages: `user_message` (`kind`: `chat` | `speech` | `board_select` | `quick_action`, `text`, optional `selected { element_id, text }`, optional `stt`) and `verification_answer`.

## 2. Turn response: SSE

`event: <type>` and `data: <JSON>`; parse every `data` with `StreamMessage`.

| `type` | What the client does |
|---|---|
| `action` | Put it in the queue ordered by `order`. `speak` is the clock |
| `speech_alignment` | Words with `start_ms`/`end_ms` for the `speak` with that `action_id`: highlight captions word by word |
| `svg_chunk` | Append to the SVG of `element_id` |
| `script_done` | Last action of the script emitted: open the mic after the last `speak` |
| `turn_done` | Everything finished (including late images) |
| `error` | Show a short message; if `recoverable`, the user can retry |

## 3. Actions (`action.name`)

`speak`, `write_text`, `write_timeline`, `highlight`, `circle_annotate`, `draw`, `draw_result`, `update_element`, `remove_element`, `ask_verification`. Elements have a stable `id` (snake_case) and a `column` (`main` | `visuals` | `side`); the client never receives coordinates. `draw` creates a placeholder; the later `draw_result` replaces it. Use `mix-blend-mode: multiply` on generated images so their white background disappears on the beige board.

## 4. Audio

In voice mode a `speak` has `audio_url` (`/api/tts/:action_id`, chunked PCM 16-bit, 24 kHz). Fetch it as soon as the action arrives (prefetch), play when the queue reaches it. Not available until Plan 2 ships; use text captions meanwhile.

## 5. Interruption

When the student starts speaking: stop the player, abort the turn `fetch` (`AbortController`), clear the queue, then send the next turn with `interrupted { turn_id, action_id?, spoken_chars?, spoken_ms? }`.

## 6. Student captions

`useStt()` (from `@mento/voice/client`, Plan 2) emits `SttCaption`: `{ kind: "interim" | "final", text, words[{ word, start_ms, end_ms, confidence }], speech_final }`. Show interim text live; send the final text as `user_message` with `kind: "speech"`.

## 7. Click-and-ask

Render each element with its `id` as a DOM attribute. On selection send `user_message` with `kind: "board_select"` and `selected { element_id, text }`.
