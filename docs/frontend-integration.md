# Front-end integration guide (whiteboard)

> **How to draw all of this on the screen (board, speech queue, captions, orb, mic, history):** see `docs/frontend-rendering-guide.md`.
> For Person 2 (whiteboard front-end). Last updated 2026-10-30.
> **Source of truth in code:** `@mento/contracts` (Zod schemas + TypeScript types). Import them in `apps/web` instead of re-typing shapes: every name in `monospace` below is exported from `@mento/contracts`.
> Machine-readable list of routes: `GET http://localhost:4000/api/openapi.json`.

## 0. Basics

| Item | Value |
|---|---|
| API base URL | `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`); every route is under `/api` |
| CORS | Allowed origin is `WEB_ORIGIN` (default `http://localhost:3000`) |
| Body format | JSON (`content-type: application/json`), field names in `snake_case` |
| Ids | Strings. Board element ids are short snake_case slugs chosen by the tutor (`title`, `tl_republica`) |
| Errors | `ErrorResponse` = `{ error: string, message?: string }`; validation errors (400) are `{ error: "validation_error", issues: [...] }` |
| Language | Everything the student sees (speech, board, error messages from the tutor) is Brazilian Portuguese |

## 1. The flow

```
Start screen                         Whiteboard
────────────                         ──────────
GET /api/subjects ──► subject cards
click a card ──► POST /api/sessions { student_id, modality, subject_id }
"free whiteboard" button ──► POST /api/sessions { student_id, modality }      (no subject)
                                     │
                                     ▼  navigate to /session/:id
                         POST /api/voice/token ──► open Deepgram WebSocket (voice mode)
                         POST /api/sessions/:id/turn { appended: [] }  ──► SSE: the tutor opens the lesson
                         student speaks/types/clicks ──► POST /api/sessions/:id/turn ──► SSE
                         speak actions ──► GET /api/tts/:action_id (PCM audio)
                         draw_result ──► GET /api/gen/:file (image)
                         leave ──► POST /api/sessions/:id/finish
```

## 2. Subjects (start screen)

A **subject** (matéria) groups the teacher's materials (books). The start screen lists the subjects with how many ready materials each has; clicking one starts a whiteboard whose sources are that subject's books. A separate button starts a **free whiteboard** with no subject (the tutor then searches every material).

### `GET /api/subjects` → 200 `ListSubjectsResponse`

```json
{
  "subjects": [
    {
      "id": "6ae53aef76bd0d7a98187cd2",
      "name": "História",
      "key": "history",
      "material_count": 1,
      "materials": [
        { "id": "6ae53af05fd94ed127ea40c9", "title": "História de Roma Antiga I (Coimbra, 2015)", "pages": 489, "status": "ready" }
      ]
    }
  ]
}
```

- Sorted by `name`. `material_count` and `materials` count only materials with `status: "ready"`.
- `key` is a stable slug (`history`, `math`): use it for icons/colors; show `name`.
- 503 `{ "error": "database_unavailable" }` while the API has no database connection.

### `GET /api/subjects/:id` → 200 `SubjectSummary`

Same shape as one item above. 404 `subject_not_found`, 503 `database_unavailable`.

### `POST /api/subjects` → 201 `Subject`

Body `CreateSubjectRequest`: `{ "name": "Matemática", "key": "math" }` (`key`: lowercase slug). Response `{ id, name, key }`. 409 `subject_key_taken`, 400 invalid key, 503 `database_unavailable`. (Mainly for the teacher side and for seeding; the whiteboard only reads subjects.)

## 3. Sessions

### `POST /api/sessions` → 201 `CreateSessionResponse`

Body `CreateSessionRequest`:

| Field | Type | Notes |
|---|---|---|
| `student_id` | string, required | Feeds the teacher's analysis. Until there is a student picker, send a fixed demo id (e.g. `"demo"`) |
| `modality` | `"voice"` \| `"text"` | Voice mode adds audio to every `speak` |
| `subject_id` | string \| null, optional | The clicked subject. **Omit it or send `null` for the free whiteboard** |
| `topic` | string, optional (≤ 120) | Optional hint of what to study |

Response: `{ "id": "…", "subject_id": "6ae53aef76bd0d7a98187cd2" }` (or `"subject_id": null` for the free whiteboard).

Errors: 404 `subject_not_found` (unknown `subject_id`), 503 `database_unavailable` (a `subject_id` was sent but the database is down), 400 `validation_error`.

What the subject changes on the server: the tutor is told the subject, the material catalog in its prompt lists only that subject's books, and every search (before each reply and the `search_materials` tool) is limited to those books. Citations (`sources`) therefore point to the subject's books. Without a subject, the tutor follows the student and searches all materials.

### `POST /api/sessions/:id/finish` → 200 `FinishSessionResponse`

Body `EndSessionRequest`: `{ "reason": "user_left" | "idle_timeout" | "beacon" | "manual" }`. Call it when the student leaves (button), after ~5 min idle, and with `navigator.sendBeacon` on tab close. It triggers the teacher-side analysis. 404 `session_not_found`.

The first call returns `{ "ok": true, "transition": "finished" }`. Repeating it is safe and returns `{ "ok": true, "transition": "already_finished" }`: it does not append another `session_ended` event or trigger analysis again. `POST /api/sessions/:id/end` remains as a backwards-compatible alias and returns `{ "ok": true }`.

### `POST /api/sessions/:id/resume` → 200 `ResumeSessionResponse`

No body. An ended session returns `{ "ok": true, "transition": "resumed" }`; an active session returns `{ "ok": true, "transition": "already_active" }`. Both are safe to retry. Resume keeps the same session id and all existing events, and appends one `session_resumed` audit event only for a real transition. 404 `session_not_found`.

### History: `GET /api/sessions` → 200 `ListSessionsResponse`

Query `ListSessionsQuery`: `student_id?`, `subject_id?`, `limit?` (1–100, default 20). Newest activity first.

```json
{
  "sessions": [
    {
      "id": "6ae54382ce3782e0372b0bb6",
      "student_id": "demo",
      "modality": "text",
      "subject": { "id": "6ae53aef76bd0d7a98187cd2", "name": "História", "key": "history" },
      "title": "O que foram as Guerras Púnicas?",
      "started_at": "2026-10-30T22:10:01.000Z",
      "last_activity_at": "2026-10-30T22:11:40.000Z",
      "ended_at": "2026-10-30T22:11:41.000Z",
      "end_reason": "manual",
      "turn_count": 2
    }
  ]
}
```

`subject` is null for a free whiteboard; `title` is the student's first message (≤ 80 chars), null until the student says something (show e.g. "Conversa sem título").

### Re-open a session: `GET /api/sessions/:id` → 200 `SessionDetailResponse`

`{ session: SessionSummary, events: Event[] }`, events in conversation order. To redraw the screen without the tutor speaking again:

- **Board:** apply every `tutor_action` event's `payload` (`{ turn_id, action_id, order, name, args }`) in order with the same renderer as live actions, skipping animations and audio. `draw_result` actions are stored too, so images come back (`args.url`).
- **Transcript:** student lines from `user_message.payload.text` and `verification_answered.payload.answer`; tutor lines from `tutor_action` with `name: "speak"` (`args.text`, `args.sources`).
- **Open question:** the last `verification_asked` without a later `verification_answered` with the same `verification_id` is still open.
- **Student edits:** `board_element_removed` / `board_element_moved` events are interleaved with the `tutor_action`s; apply them in event order (see below), so the reopened board shows the student's deletions and order.
- To **continue** an ended conversation, first `POST /api/sessions/:id/resume`, then send turns to the same `id`. Sessions and their append-only history survive API restarts. Calling `/turn` while `ended_at` is set returns 409 `{ "error": "session_ended" }`.
- Finish the resumed conversation with `/finish`. The analysis row remains unique per session id: lifecycle-only retries reuse the cached result, while new turns/evidence change the input hash and update the same analysis and open insights instead of duplicating them.

Errors: 404 `session_not_found`, 503 `database_unavailable`.

### Student board edits: `POST /api/sessions/:id/board` → 200 `BoardEditResponse` (plan F, D79)

The student deletes or moves a block. Body `BoardEditRequest`:

```json
{ "op": "remove", "edit_id": "1f6c…", "element_id": "titulo" }
{ "op": "move", "edit_id": "9a2b…", "element_id": "nota", "column": "main", "after_id": "titulo" }
```

- `edit_id` is a client uuid (1–64 chars): resending the same edit answers `{ "ok": true, "result": "already_applied" }` and stores nothing. Retry freely.
- A move is **absolute**: the element goes to `column`, right after `after_id` (`null` = top of the column). Anchor on the element above the drop slot, never send an index (the server may already hold tutor blocks the student has not seen). An `after_id` the server does not find in that column puts the element at the end.
- Removing (or moving) an element that is already deleted answers 200 `already_removed`. 404 `element_not_found` only for an id that never existed in the session; 404 `session_not_found`; 400 for a bad body.
- Works on ended sessions too (no resume needed).
- Stored events: `board_element_removed { element_id, edit_id }` and `board_element_moved { element_id, column, after_id, edit_id }`, in `GET /api/sessions/:id`.
- The tutor sees the result on its next round: each column in the student's order, deleted ids as tombstones (it cannot point at or re-create them; a late `draw_result` for a deleted picture is never sent), new blocks appended at the end of their column.
- Undo has no event: hold the delete client-side for the 6 s toast and send it when the toast closes, on `pagehide` (`editBoard(id, edit, { keepalive: true })` in `apps/web/src/lib/api.ts`) and before sending any turn.
- Never shown to the teacher or read by the analysis (rule 6). Mock mode (`NEXT_PUBLIC_MOCK_API=1`) stores the event in the in-memory session with the same answers; with `NEXT_PUBLIC_TURN_SOURCE=fixture` edits stay local (fixture turns are not stored).

## 4. Turns: `POST /api/sessions/:id/turn` (Server-Sent Events)

### Request body: `TurnRequest`

```json
{
  "modality": "voice",
  "appended": [
    { "name": "user_message", "kind": "speech", "text": "Quem foi Augusto?", "stt": { "provider": "deepgram", "duration_ms": 1800, "confidence": 0.94 } }
  ],
  "interrupted": { "turn_id": "turn_2", "action_id": "act_2_3", "spoken_chars": 40, "spoken_ms": 2100 },
  "client_timing": { "speech_end_to_audio_ms": 2300 }
}
```

| Field | Notes |
|---|---|
| `appended` | **Empty array for the opening turn**: send it right after the session is created so the tutor greets and proposes topics |
| `user_message` | `kind`: `chat` (typed), `speech` (final STT caption), `board_select` (click-and-ask, add `selected: { element_id, text? }`), `quick_action`. `text` ≤ 2000 chars |
| `verification_answer` | Answer to an `ask_verification` question: `{ "name": "verification_answer", "verification_id", "element_id", "answer" }` |
| `interrupted` | Send when the student cut the tutor off: the last `turn_id`, the `action_id` of the `speak` being played, and how much was spoken |
| `client_timing` | Optional: ms between the end of the student's speech and the start of the tutor's audio (latency report) |

Errors before the stream starts: 404 `session_not_found`, 409 `session_ended` (call `/resume` first), 503 `tutor_unavailable` (no LLM key on the server), 400 `validation_error`.

### Response: an SSE stream of `StreamMessage`

Each event is `event: <type>` + `data: <JSON>`, and the JSON always has a `type`. `EventSource` cannot POST, so read the stream with `fetch` (see §8). Parse every `data` with `StreamMessage.parse`.

| `type` | Shape | What the client does |
|---|---|---|
| `action` | `{ order, action: { id, name, args } }` | Put it in the playback queue in `order`. `speak` is the clock: the next action waits until the speech ends |
| `speech_alignment` | `{ action_id, words: [{ word, start_ms, end_ms }] }` | Word timings of the `speak` with that `action_id` (from the start of its audio): highlight captions word by word. May arrive before or after the audio starts |
| `svg_chunk` | `{ element_id, chunk }` | Append to that element's SVG (structured diagrams; not emitted yet) |
| `script_done` | `{ turn_id }` | Every scripted action was sent: **open the microphone after the last `speak` finishes**; do not wait for images |
| `turn_done` | `{ turn_id, timing? }` | Everything finished, including late images (or their timeout). `timing` holds server stage times in ms |
| `error` | `{ code, message, recoverable }` | Show a short message; if `recoverable`, let the student try again. No `turn_done` follows |

Late messages: `draw_result` (and the image fallback `update_element`) arrive after `draw`, often after `script_done`; they keep increasing `order`.

## 5. Actions (`action.name` and `action.args`)

Every element the tutor creates has a stable `id` and a `column` (`main` | `visuals` | `side`); the client never gets coordinates. Render each element with its `id` as a DOM attribute (needed for click-and-ask and for later actions that target it).

| Name | Args | Client behavior |
|---|---|---|
| `speak` | `text`, `style?`, `purpose?` (`explain`/`hint`/`praise`/`question`/`transition`), `hint_level?` (1–3), `sources?`, `outside_material?`, `audio_url?`, `audio_format?` | Play `audio_url` (voice mode) or show `text` as a caption (text mode). Show `sources` as citation chips; mark `outside_material: true` visibly |
| `write_text` | `id`, `column`, `html`, `purpose?`, `hint_level?`, `sources?`, `outside_material?` | Handwritten text block. `html` is already sanitized server-side (only `h1–h3, p, b, i, br, ul, ol, li, span`, no attributes) |
| `write_timeline` | `id`, `column`, `events: [{ date, label }]` (1–12) | Timeline component |
| `highlight` | `target_id`, `color` (`yellow`/`green`/`pink`/`blue`) | Marker highlight on an existing element |
| `circle_annotate` | `target_id`, `text_to_match`, `color` (`red`/`blue`/`green`) | Circle that text inside the element (case-insensitive match; the server guarantees it occurs) |
| `draw` | `id`, `column`, `prompt`, `is_structured`, `max_dimensions: { w, h }` | Insert a **placeholder** of that size; the picture comes later in `draw_result` |
| `draw_result` | `element_id`, `url` | Replace the placeholder with the image at `API_URL + url` (`/api/gen/<key>.jpg`). Use `mix-blend-mode: multiply` so the white background disappears on the beige board |
| `update_element` | `id`, `html` | Replace the content of an element (also used as the image fallback: a caption card `[ilustração: …]`) |
| `remove_element` | `id` | Remove the element |
| `ask_verification` | `id`, `column`, `verification_id`, `concept`, `concept_key`, `question`, `kind` (`explain`/`transfer`/`place_on_timeline`) | Show the question on the board and wait; send the answer as a `verification_answer` |

Citation (`Citation`): `{ material_id, page, quote }`. The quote was checked against that page of the book; fake citations are removed by the server before the action is sent. To open the source, use the material id from `GET /api/subjects` and the page number.

## 6. Voice

### Student speech (STT): `POST /api/voice/token` → 200 `VoiceTokenResponse`

```json
{ "token": "<jwt>", "expires_in": 30, "ws_url": "wss://api.deepgram.com/v1/listen", "params": { "model": "nova-3", "language": "pt-BR", "encoding": "linear16", "sample_rate": "16000", "...": "..." } }
```

Use the ready-made hook instead of opening the socket by hand:

```tsx
import { useStt } from "@mento/voice/client";
import { VoiceTokenResponse } from "@mento/contracts";

const stt = useStt({
  getToken: async () => VoiceTokenResponse.parse(await (await fetch(`${API}/api/voice/token`, { method: "POST" })).json()),
  onSpeechStarted: () => interrupt(),             // stop the tutor audio, abort the turn fetch
  onFinal: (caption) => sendTurn({ name: "user_message", kind: "speech", text: caption.text }),
});
// stt.start(), stt.stop(), stt.setMuted(true | false), stt.caption (SttCaption: interim/final text + word timings), stt.state
```

`SttCaption` = `{ kind: "interim" | "final", text, words: [{ word, start_ms, end_ms, confidence }], speech_final }`: show the interim text live, send the final one. Mute the mic while the tutor speaks and unmute after `script_done` + the last `speak` (headphones recommended: the tutor's voice must not trigger `SpeechStarted`). Errors: 503 `voice_unavailable` (no Deepgram key). Token minting works with a Deepgram key that has the Member role (verified 2026-10-30).

### Tutor speech (TTS): `GET /api/tts/:action_id`

Chunked raw audio: PCM signed 16-bit little-endian, 24 kHz, mono (`X-Audio-Format: pcm_s16le_24000`). It starts streaming before the synthesis ends, so fetch it as soon as the `speak` action arrives. Use the ready-made player:

```ts
import { PcmPlayer } from "@mento/voice/client";
const player = new PcmPlayer();
player.onWord((w) => highlightCaption(w));      // from speech_alignment
player.setWords(words);                          // when the speech_alignment message for this action arrives
await player.play(`${API}${action.args.audio_url}`, abortSignal); // resolves when the audio ends
player.stop();                                   // on interruption
player.level();                                  // 0..1, drive the orb
```

Errors: 404 `audio_not_found` (unknown or expired action, kept 5 min), 503 `tts_unavailable` (no ElevenLabs voice configured: fall back to captions).

## 7. Images: `GET /api/gen/:file`

`file` = `<32 hex chars>.jpg|png|webp`, as given in `draw_result.url`. Long-lived cache headers. 404 `image_not_found`.

## 8. Reading the turn stream (POST + SSE with fetch)

```ts
import { StreamMessage, type TurnRequest } from "@mento/contracts";

export async function runTurn(sessionId: string, body: TurnRequest, onMessage: (m: StreamMessage) => void, signal: AbortSignal) {
  const res = await fetch(`${API}/api/sessions/${sessionId}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal, // abort on interruption
  });
  if (!res.ok || !res.body) throw new Error(`turn failed: HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (data) onMessage(StreamMessage.parse(JSON.parse(data))); // lines starting with ":" are keep-alives
    }
  }
}
```

## 9. Interruption (barge-in)

When the student starts speaking (`onSpeechStarted`) or types while the tutor talks: `player.stop()`, abort the turn `fetch` (`AbortController`), clear the queue (keep the board as it is), then send the next turn with `interrupted: { turn_id, action_id, spoken_chars?, spoken_ms? }`. The server cancels the LLM, the TTS and pending images when the connection closes.

## 10. Click-and-ask

On a click/selection of a board element, send `user_message` with `kind: "board_select"`, `selected: { element_id, text }` (the selected text, if any) and the student's question (typed or spoken). The tutor answers about that element and may highlight or circle it.

## 11. Developing without the LLM: fixtures

`GET /api/dev/fixture-turn?name=rome-intro&speed=1` replays a recorded turn in exactly the same SSE format (`speed=0` instant). Fixtures: `fixtures/turns/rome-intro.json` (title, speech with word timings, illustration, timeline, citation, circle, late image) and `click-and-ask.json` (highlight, side note, verification). Audio URLs in fixtures point to `/api/tts/...` and will 404 unless a real TTS job exists; image URLs are examples.

Dev pages and tools: **`/dev/conversation`** (a full conversation test bench: pick a subject, talk or type, see board actions, citations, images, verification answers, click-and-ask, interruption and per-turn latency; its source is a working reference for the integration), `/dev/voice-lab` (microphone + captions + TTS playback), `POST /api/dev/tts-start { action_id, text }` (starts a TTS job for any text).

## 12. Endpoint summary

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `GET /api/subjects` | | 200 `ListSubjectsResponse` | 503 |
| `GET /api/subjects/:id` | | 200 `SubjectSummary` | 404, 503 |
| `POST /api/subjects` | `CreateSubjectRequest` | 201 `Subject` | 400, 409, 503 |
| `POST /api/sessions` | `CreateSessionRequest` | 201 `CreateSessionResponse` | 400, 404, 503 |
| `GET /api/sessions?student_id=&subject_id=&limit=` | | 200 `ListSessionsResponse` | 400, 503 |
| `GET /api/sessions/:id` | | 200 `SessionDetailResponse` | 404, 503 |
| `POST /api/sessions/:id/turn` | `TurnRequest` | 200 SSE of `StreamMessage` | 400, 404, 409, 503 |
| `POST /api/sessions/:id/board` | `BoardEditRequest` | 200 `BoardEditResponse` | 400, 404, 503 |
| `POST /api/sessions/:id/finish` | `EndSessionRequest` | 200 `FinishSessionResponse` | 400, 404 |
| `POST /api/sessions/:id/resume` | | 200 `ResumeSessionResponse` | 404 |
| `POST /api/sessions/:id/end` | `EndSessionRequest` | 200 `{ ok: true }` (compatibility alias) | 400, 404 |
| `POST /api/voice/token` | | 200 `VoiceTokenResponse` | 500, 503 |
| `GET /api/tts/:action_id` | | 200 PCM stream | 404, 503 |
| `GET /api/gen/:file` | | 200 image | 400, 404 |
| `GET /api/dev/fixture-turn?name=&speed=` | | 200 SSE of `StreamMessage` | 400, 404 |
| `POST /api/dev/tts-start` | `{ action_id, text }` | 202 | 503 |
| `GET /api/health` | | 200 `HealthResponse` | |
| `GET /api/openapi.json` | | 200 OpenAPI document | |

## 13. Current limits to know about

- First tutor action arrives after ~1.5–3.5 s (target 1.5 s); show the orb "thinking" state as soon as the turn request is sent. A bridging line ("Deixa eu pensar um instante…") is spoken if nothing arrives within 3 s.
- Images take ~5 s; the placeholder must not block anything.
- Every session route needs MongoDB: when it is not connected they answer 503 `database_unavailable`.
- No ElevenLabs voice is configured yet, so `audio_url` is absent and `/api/tts` answers 503: text captions only until `ELEVENLABS_VOICE_ID` is set.
