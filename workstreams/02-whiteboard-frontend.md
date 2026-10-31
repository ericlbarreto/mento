# Person 2 — Whiteboard front-end

> Status: proposed plan, 2026-10-30. Everything technical learned from the Studdy teardown (`docs/15-studdy-teardown.md`) and the roadmap (`docs/16-technical-roadmap.md`) applies here. Seams: `handoffs-and-insights-pipeline.md`. Visual language: `docs/18-ui-references.md` §6 and `docs/19-brand-assets.md`.

## Mission

Build the **student experience**: a beautiful, fluid DOM whiteboard where the tutor writes and draws live, the student can **point at anything and ask about it**, and the mascot-driven orb makes the conversation feel alive. You own the **design system** (`packages/ui`) used by everyone.

## You own (paths)

`apps/web/src/app/(student)/**` · `packages/board/**` · `packages/ui/**` · `apps/web/public/brand/**` (copied from `assets/` at kickoff) · `apps/web/src/lib/api.ts` (typed client for the API) · `fixtures/` (your own files).

## You consume

The **API service** (`apps/api`, Fastify, base URL `NEXT_PUBLIC_API_URL`, prefix `/api`; D43), including Person 3's **fixture replay** `GET /api/dev/fixture-turn?name=…`, which you use to build everything before the real tutor exists.

The **SSE turn stream** from Person 3 (same schema as the fixtures), `GET /api/students`, `GET /api/materials`, `POST /api/sessions`, `GET /api/files/:id`, and (Should) Person 3's `useStt()` / `SpeechPlayer`. You emit user events: `user_message` (`chat`, `speech`, `board_select`), `answer_submit`, `interrupted`, and call `POST /api/sessions/:id/end`.

## Day-0 checks (≤ 1.5 h)

1. **Handwriting font renders pt-BR accents** (ã ç é õ â ê) in the board font (Caveat/Kalam); pick another if not.
2. **Circle annotation prototype:** circle a substring inside a wrapped paragraph and inside a KaTeX equation.
3. **Mascot GIF stacking:** four GIFs preloaded and cross-faded without flicker at 160–200 px.

## Architecture of the board

- **DOM, not canvas.** Columns (`main`, `visuals`, `side`), horizontal scroll as columns fill. Elements are React components keyed by id in an **element registry** (`Map<id, ElementState>`); memoized so adding one element never re-renders the others.
- **Action queue** (client side, a single ordered playback): `speak` is the clock; `write_*`, `highlight`, `circle_annotate` run with their animation; `draw` inserts a **placeholder** and continues; `draw_result` swaps it. Pause/resume = pause the queue.
- **Fixture mode first:** build everything against `/api/dev/fixture-turn?name=…` (same SSE format as the real stream) so you never wait for the LLM.
- **Sanitizer:** all model HTML/SVG passes an allowlist sanitizer before insertion (`h1–h3`, `p`, `b`, `i`, `br`, `ul/ol/li`, `span`; SVG: basic shapes and paths, no scripts/handlers/external refs).

## Identifying an element (click-and-ask)

The tutor assigns each element a stable `id` (`lesson_title`, `timeline_1`, …); student-authored elements get `s_1`, `s_2`.

1. **Every element** renders with `data-element-id`. Hover shows a soft outline and a small "Perguntar sobre isso" affordance; keyboard accessible (Tab to focus, Enter to ask).
2. **Text selection:** within an element, the student can select words; read it with the **Selection API** (`range`, `toString()`, offsets relative to the element text). Timeline items and image regions are selectable as whole objects.
3. **Send a `user_message`** `{ kind: "board_select", text: <the question>, selected: { element_id, text? } }` and nothing else (shapes: `contracts-spec.md` §3): the **server builds the board snapshot** (id | type | column | truncated text). Keep the client payload small.
4. **Visual feedback in < 100 ms:** the selected element gets a blue outline pulse while the orb turns to "pensando".
5. The tutor's reply can `highlight`/`circle_annotate` the same element, so the answer visibly lands where the student pointed.

## Circling an element (`circle_annotate`) — step by step

Input: `target_id`, `text_to_match`, `color`.

1. Find the target element; **walk its text nodes** (`TreeWalker`) and locate `text_to_match` (accent- and whitespace-insensitive, first match).
2. Create a **`Range`** over the match; call `range.getClientRects()`; take the **union rectangle** (if the text wraps across lines, circle the first line's rect or the union with a cap).
3. Convert the rect to the **element's coordinate system** and draw an **SVG ellipse path** with padding (`rx = w/2 + pad`, `ry = h/2 + pad`), slightly **irregular and overshooting** so it looks hand-drawn.
4. **Animate the stroke:** `stroke-dasharray = pathLength` (`getTotalLength()`), animate `stroke-dashoffset` from full to 0 (~600 ms, ease-out); color from tokens (blue/orange/red).
5. **Re-measure on resize** (`ResizeObserver`); the overlay is positioned inside the element so it moves with scroll.
6. **KaTeX/LaTeX:** match against the rendered spans (`.katex` HTML) or `data-latex` fragments; fallback = circle the whole formula.
7. **Not found?** Circle the whole element and log `annotation_fallback`; never throw.
8. Reduced motion: draw instantly, no dash animation.

`highlight` is similar: a **blob-shaped SVG marker** behind the element (multiply blend), revealed left to right with a clip-path.

## Writing animation

`write_text`: typewriter at ~40 characters/s (variable pace), a **pencil icon trailing the caret**, instant when the queue is skipped/interrupted or reduced motion is on. Reserve the final height up front to avoid layout shift.

## Making the experience fluid

- **Never block the UI.** Render optimistically; the orb shows state; the board keeps accepting input.
- **Interrupt in < 100 ms:** new user input → stop audio, clear the queue, `AbortController` on the SSE, keep the board as is, send `interrupted` with how far the tutor got.
- **Animate only `transform` and `opacity`** (GPU); avoid animating layout properties; use `content-visibility: auto` for off-screen columns.
- **Placeholders** for images sized with `maxDimensions`; fade-in on arrival; skeletons for the PDF drawer.
- **Smooth auto-scroll** to the newest element (`scrollIntoView({behavior:'smooth', inline:'center'})`), paused if the student is scrolling manually.
- **Prefetch/preload:** the four mascot GIFs and fonts at start; the next `speak` audio is prefetched by the speech player (Person 3).
- **Budget:** 60 fps on a laptop; measure with the Performance panel at day 0 and before the demo.
- **Reduced motion and keyboard** support everywhere.

## Responding to the student (how the student answers and how the UI replies)

> The founder's note read "como responder estudos"; interpreted as **how the student answers/asks and how the tutor's response is presented** (confirm in `docs/10-decisions.md`, Q18).

| Student input | UI behavior |
|---|---|
| **Typed message** | Appears instantly in the chat strip; orb → *pensando*; tutor actions start within ~1.5 s |
| **Voice** (Should) | Session **opens in voice** (D47); mic button; live interim transcript; final text sent as `user_message(kind=speech)`; mic auto-opens after a tutor question |
| **Click-and-ask** | `board_select` as above |
| **Answer to a verification question** | The `question` element contains an input (and optional choices); submit → `answer_submit`; the orb shows *pensando* while the judge runs |
| **Quick actions** | Chips: "Explica de novo", "Dá um exemplo", "Mais devagar", "Voltar" → sent as `user_message` with a canned text |
| **Pause / resume / mute** | Pause freezes the queue and audio; resume continues |
| **Errors / offline** | Inline "tentando de novo…", retry once, then offer text mode; never lose the typed message |

Tutor output: captions above the orb with **word highlight** when timings exist, source chips under the captions and on elements, **"Fora do material"** tag when `outside_material` is true.

## Sources and the PDF viewer

Chips (`Livro · p.12`) open a **drawer with pdf.js** at the page and **highlight the quote** by searching the text layer: normalize accents/whitespace/ligatures on both sides; if the exact quote is not found, highlight the longest matching run and keep the page open. Skeleton while loading.

## Start screen and session lifecycle

1. **Start screen (D47):** the student is **pre-set** (`NEXT_PUBLIC_DEMO_STUDENT_ID`, else the first seeded student; greeting "Oi, {nome}!"). **"O que vamos estudar?"** shows one card per **subject** from `GET /api/subjects` with its count of `ready` materials ("3 materiais"). Below the cards, the **Mento button** (mascot) starts a **free session** (`subject: null`). Clicking either calls `POST /api/sessions` and opens the whiteboard. No name picker, no topic field.
2. **Opening in voice:** the whiteboard opens with the mic armed; the tutor's first turn (no student message) greets the student and asks what they want to study; the student answers by voice. The **chat strip** is always visible next to the board; if voice is unavailable or the mic is denied, the greeting shows in the chat and the input gets focus.
3. **End of conversation** (Person 3 turns it into `session_ended`): a visible **"Terminar conversa"** button, an idle timeout (5 min without input), and `navigator.sendBeacon('/api/sessions/:id/end')` on tab close.

## Visual direction and animations with the mascot

The test interface is **light beige with the Mento blue**; use the brand assets in the repo (`assets/brand/`, `assets/brand-concepts/mascot-gifs/`) via `apps/web/public/brand/` (`docs/19-brand-assets.md`). Tokens and the full moment-by-moment animation list are in `docs/18-ui-references.md` §6. Highlights:

- **Header:** `logo.png`; **favicon/app icon:** the symbol icons.
- **Orb (bottom center):** mascot GIFs by state (`float` idle, `thinking`, `speaking`, `spin` loading) + a ring driven by mic/TTS amplitude; static `mascot.png` for reduced motion.
- **Start screen:** the mascot floats and "greets"; cards enter with a gentle stagger.
- **Moments:** tutor starts (mascot perks up), thinking wobble during latency, speaking pulse in sync with audio, **correct-answer burst** (ring pulse + sparkle), gentle idle float.
- **Use the `impeccable` skill** for the design system and every student screen: apply its typography/spacing/color/motion guidance, then the checklist (AA contrast, focus states, empty/loading/error states, motion that explains rather than decorates). *If it is not installed, use Anthropic's `frontend-design` skill and tell the founder.*

## Task list (order = priority)

| # | Task | Tier | Est. | Done when |
|---|---|---|---|---|
| T1 | Kickoff: tokens + base components + brand copy (K9) | Must | 2 h (shared) | Tokens and chips exist; assets in `public/brand` |
| T2 | Board skeleton: columns, registry, scroll, sanitizer | Must 1 | 3 h | Fixture elements render |
| T3 | Action queue + playback + interruption + placeholders | Must 1 | 4 h | Fixture plays in order; interrupt clears it |
| T4 | Renderers: text (typewriter + pencil), timeline, image, svg (+noise filter) | Must 1 | 4 h | All fixture element types render |
| T5 | `highlight` + `circle_annotate` | Must 1 | 2 h | Circle lands on the right words, wrapped and KaTeX cases |
| T6 | Chat strip, input, captions, quick-action chips, answer UI | Must 2 | 3 h | A full text exchange works against fixtures |
| T7 | Click-and-ask (select, focus ring, `board_select`) | Must 2 | 2 h | Selected element reaches the server payload |
| T8 | Start screen (pre-set student, subject cards with material counts, Mento button for a free session) + voice opening + end-of-conversation controls (D47) | Must 8 | 2 h | Card or Mento button creates the session; tutor greets and asks what to study; end triggers `session_ended` |
| T9 | Source chips + pdf.js drawer with quote highlight | Must 5 | 4 h | Chip opens the highlighted quote |
| T10 | **Orb with mascot GIFs** + ring + states | Must 2 / Should | 2.5 h | All states switch without flicker |
| T11 | Animation polish with `impeccable` (start, thinking, success burst, transitions) | Should | 4 h | Design checklist passes |
| T12 | Voice UI hooks (mic button, interim text, audio-level to orb) with Person 3's hooks | Should 11 | 2 h | Mic → text → turn; orb reacts to levels |
| T13 | "My progress" (student view) | Nice 13 | 2 h | |

**Must ≈ 27 h.** If tight: orb animation polish (T11) and the success burst slip first; the orb itself stays.

## Acceptance criteria

- [ ] A full fixture lesson plays: timeline, Colosseum image placeholder → image, highlights and circles in the right place.
- [ ] Click-and-ask on a date sends `board_select` and the tutor's reply circles that date.
- [ ] Interruption stops audio and clears the queue in < 100 ms.
- [ ] Chip click opens the PDF at the highlighted quote.
- [ ] pt-BR accents render correctly everywhere; AA contrast on the beige background.
- [ ] Looks and feels like one product with the teacher interface (same tokens, chips, mascot).

## Risks

- **Circle offsets on wrapped text/KaTeX** → prototype on day 0; fallback circles the element.
- **GIF weight/flicker** → preload and stack; static PNG fallback.
- **Layout shift from images** → reserve space with `maxDimensions`.
- **Scope of polish** → ship the orb and queue first, polish later.
