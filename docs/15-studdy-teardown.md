# 15 — Studdy teardown (how a whiteboard tutor works under the hood)

> Status: **research notes, 2026-10-30.** Observed through the browser (network, event log, DOM) on one account, in two short sessions (History/Colosseum via PDF upload; Math/quadratics via text). Mento does **not** copy Studdy; we use it to understand the mechanics and then build our own design (see `01-hackathon-scope.md`).
> Labels: **[Observed]** seen directly; **[Inferred]** deduced from names/behavior; **[Unknown]** not determined.

## 1. Big picture

The tutor is an LLM that emits a **script of tool calls**. The client plays the script in order. The LLM never produces pixels.

```
Student (voice/typing)
   │  POST /api/session/generate-response   body = delta of the session event log + session head
   ▼
Server: LLM with tools ──► Server-Sent Events stream (text/event-stream)
   │   one JSON event per action: {orderIndex, actionItem{name,args}}
   │   plus {"_stream":"svg","elementId":...,"chunk":"<svg ..."} chunks for structured drawings
   ▼
Client executes actions in order: speak (TTS) / write_text / write_latex / highlight / circle_annotate / draw
   │   every action is also stored: GET /api/session/:id/events
```

- **[Observed]** The client sends the **event log delta** (`appended`, `removed`, `head`) rather than a chat transcript. `head` carries topic, tutor persona, experiment flags, file uploads, session type, and a pre-classification of the request (`denseCoverage`, with a verdict and reason).
- **[Observed]** The whole script for a turn arrives within ~2–8 seconds; the first action arrives **~1.4–1.7 s** after the request (4 turns measured: 1425, 1422, 1452, 1709 ms).
- **[Observed]** After a student message (voice or typed), the first tutor event appears **~2 s** later; the tutor reacts by adding new board elements and speaking, so interruption works as "a new turn".

## 2. Tool catalog (observed)

| Tool | Args | Effect |
|---|---|---|
| `speak` | `text`, `type`, `style` (e.g., `friendly`, `chat`, `sports_commentary`), `styledegree` | Tutor talks; captions highlight word by word |
| `write_text` | `id`, `text` (HTML, inline `$LaTeX$`), `position{spaceId, columnId}` | Adds a text element in handwriting font |
| `write_latex` | `id`, `latex`, `color`, `position` | Adds a rendered equation (KaTeX) |
| `highlight` | `id`, `color`, `targetElementId` | Marker-style highlight on an existing element |
| `circle_annotate` | `color`, `textToMatch`, `targetElementId` | Circles a **substring** of an existing element (e.g., `x^2` inside an equation) |
| `draw` | `id`, `prompt`, `position`, `maxDimensions`, `isStructured` | Generates an illustration or diagram (two pipelines below) |

Events are ordered by `turnIndex.orderIndex.subOrderIndex`. Other event names seen: `session_started`, `message_received_from_tutor`, `message_sent_by_user` (type `speech` or `chat`), `whiteboard_element_added`, `whiteboard_element_edited`, `whiteboard_annotation_added`, `mic_unmuted`, `mic_muted`.

## 3. How drawings are produced

**Artistic (`isStructured: false`)** — e.g., "sketch of the Roman Colosseum, architectural doodle style".
- **[Observed]** The `draw` prompt is free text with the style written into it. Result: a **PNG ~1408×768, ~2 MB** stored in object storage (`generated_images/<timestamp>-colosseum_sketch.png`), shown inside a box capped by `maxDimensions` (500×400).
- **[Observed]** Two events fire for the same element (`added` then `edited`): consistent with a placeholder replaced when the image is ready.
- **[Inferred]** An image-generation model creates the PNG. **[Unknown]** which model, cost and exact generation time (the image appeared within ~10 s of the tutor announcing it).

**Structured (`isStructured: true`)** — e.g., "upward opening parabola on a coordinate plane".
- **[Observed]** A second generation step **streams raw SVG markup over the same SSE stream**: `{"_stream":"svg","elementId":"parabola_sketch","chunk":"<svg ... width='300' height='300' viewBox=...><g data-descriptor='coordinate-axes' ...>"}` — ~30 chunks, starting ~2.5 s after the `draw` call. The SVG groups carry `data-descriptor` names (semantic parts such as `coordinate-axes`).
- **[Observed]** The SVG is rendered inline and uses a shared SVG filter `wb-noise-v2-shared` (`feTurbulence` + `feColorMatrix` + `feComposite`) to give a **pencil/chalk texture**. Elements also carry an `isCoordinatePlane` field.
- **[Inferred]** Structured diagrams are LLM-written SVG, which is why labels and axes are exact.

**Annotations**
- **[Observed]** `highlight` is an SVG path with an irregular hand-drawn blob outline behind the target element; `circle_annotate` is an SVG ellipse path with a **stroke-dash animation** (the circle draws itself).

## 4. The board

- **[Observed]** The board is **DOM, not canvas**: no `<canvas>`, no tldraw/Excalidraw. Titles are `<h1>`, body text is HTML elements in a handwriting font (Caveat; fallbacks Kalam, Mynerve, Nanum Pen Script, Hachi Maru Pop for other scripts), math is KaTeX.
- **[Observed]** Layout is by **spaces and columns** (`spaceId`, `columnId` such as `main_track`, `main_col`, `visuals`), not free x/y coordinates. Each element has a stable `elementId`, so annotations target ids (and substrings).
- **[Observed]** The board scrolls horizontally as new columns appear. A pencil icon trails the text as it is "written".
- **[Inferred]** Text is revealed progressively on the client to simulate writing.

## 5. Voice

- **STT [Observed]:** the browser opens a **WebSocket straight to Deepgram** (`wss://api.deepgram.com/v2/listen`) using a short-lived token (30 s `expires_in`) fetched from `/api/voice/get-token`. The `v2/listen` endpoint matches Deepgram's turn-aware model (**[Inferred]**: Flux). The user's utterance becomes a `message_sent_by_user` event of type `speech`.
- **Mic behavior [Observed]:** the mic auto-unmutes after the tutor asks a question and mutes again afterwards (`mic_unmuted` / `mic_muted` events).
- **TTS [Unknown]:** no TTS request or `<audio>` element was visible from the page's main thread, and Web Speech was not used. `speak` args carry `style` and `styledegree`, which are the same names as **Azure Speech SSML** `express-as` (**[Inferred]**, not confirmed). Captions highlight word by word, which implies word-level timing.
- **Personas [Observed]:** selectable tutors (Alfrenzo "energetic and fun", Rubie "warm and friendly"), switchable mid-lesson; `style` per utterance changes the delivery.

## 6. Pedagogy behaviors (observed)

- Opens with a short greeting and the lesson title on the board.
- Asks a **diagnostic self-rating** ("scale of one to ten, how much do you remember about factoring?") before teaching the specific problem.
- **Memory across sessions [Observed]:** "Welcome back… round two".
- Writes a "goal" box, shows the example, circles the relevant part, then asks the student to find the numbers.
- Acknowledges the student's answer, adds a new element when asked "why?", and highlights the relevant term.
- Landing-page claims (not verified): practice questions from the student's own material.

## 7. Other stack details (observed)

Next.js frontend; Supabase for object storage (user PDFs, generated images); pdf.js in the client (PDF thumbnails/parsing); KaTeX; LaunchDarkly (feature flags, experiments such as `wb_dense_coverage`, `wb_opus_start`); Amplitude (analytics); Paddle (billing); per-action `PATCH /api/session/:id` (state persistence) and a heartbeat.

## 8. What Mento takes, and what it changes

| Mechanic | Studdy | Mento |
|---|---|---|
| Tutor as script of tool calls over SSE | Yes | **Adopt** (`speak`, `write_text`, `write_latex`, `highlight`, `circle_annotate`, `draw`, plus `cite_source`, `ask_verification`, `record_evidence`) |
| Board in DOM with ids and columns | Yes | **Adopt**; click-and-ask is natural because every element has an id |
| Artistic images via image model, structured diagrams via streamed SVG | Yes | **Adopt both**; for History use artistic images, SVG for timelines/maps |
| Event log as session state | Yes | **Adopt** (Must #7); also feeds evidence and the teacher's picture |
| Deepgram STT from browser with short-lived token | Yes | **Adopt** (Should) |
| Teacher side, citations to the teacher's PDFs, evidence, student picture | Not seen | **Mento's differentiator** |
| Click-and-ask on a board object | Not seen (only start of a lesson explored) | **Mento's differentiator**, needs testing against competitors |

Mento's own product design (subject/lesson grounding, citation chips, evidence, teacher screen) stays as decided in `01-hackathon-scope.md`.

## 9. Not tested / open

- TTS provider and how audio reaches the client.
- Image model, latency and cost per image; whether backgrounds are removed.
- Voice-first UX details (interruption while the tutor speaks, pause/resume).
- Exam Prep and Homework modes; export/download; sharing.
- Whether Studdy has click-to-ask on board elements.
- Observations come from one account and two sessions; behaviors may vary.
