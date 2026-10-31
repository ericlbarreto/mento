# Plan A — The board is written live by a pen

## FINAL (merged after independent reviews: Lua = product acceptance, Íris = interface)
Both reviewers agree on the direction; the merged decisions below override the draft that follows.

**Acceptance (observable)**
1. A new `write_text` / question shows its first stroke and the pen within 150 ms; no full block flashes first.
2. Reveal = a clip **wiped along each line, driven by the caret x** (glyphs appear partly drawn), not one grapheme toggled at a time. Duration per element = `clamp(chars/45, 0.6 s, 2.5 s)` + 120 ms per line break; driven by elapsed time (slow devices drop frames, not speed). Blocks > 200 chars: line by line at the cap.
3. **Catch-up:** when a new board action arrives, the element being written finishes within 300 ms — writing never trails speech by more than one element.
4. **Turn end:** before the orb goes to listening/waiting and the mic unmutes, all writing is complete; an `ask_verification` question is fully visible before the student can answer.
5. Interruption, hidden tab, replay/reopen, elements on mount, `prefers-reduced-motion`: no animation (interruption = 150 ms fade to full text); pen hidden. Queue `pause()` pauses the pen; resume continues.
6. Pen: ~28 px at scale 1 (×1/scale, clamp 22–36 px on screen), tilted ~40°, tip bottom-left so it never covers the line; soft shadow; lerp 0.35/frame (max lag 6 px), line break = 180 ms arc; fades (200 ms) only after the whole queue is idle for 600 ms; `aria-hidden`.
7. Circle starts 150 ms after its target is written; 700 ms `cubic-bezier(.45,0,.25,1)`; the pen traces it.
8. Camera frames the whole element once at write start; re-follows only if the caret leaves the safe inset (bottom = min(260 px, 35 % vh)); never overrides the 4 s manual-pan idle.
9. Source chips / "Fora do material" fade in after the element finishes; no empty frames for queued elements.
10. Unwritten text hidden with clip/opacity (never `display:none`) so screen readers read it at once; pointerdown/focus on a writing element finishes it, and click-and-ask sends the full text.
11. Math text (`x² + 3 = 7`, fractions, sub/superscripts) reveals cleanly — tested with a Math fixture.
12. No long task > 50 ms in a Performance trace while writing and panning.

**Slice 1 (demo):** write_text + question reveal, pen, circle drawn by the pen, all flush rules. **Slice 2:** marker sweep line by line (under the ink, multiply, lower 60 %, 280 ms/line), timeline glyph writing (slice 1: row by row), `update_element` diff-writing (keep prefix, rewrite the changed tail), voice-aligned writing.

**Voice sync:** independent speed + catch-up (decided); writing starts no earlier than ~300 ms before its paired speak. Alignment-driven sync is slice 2.

**Status:** implementation spike on `feat/p2-handwriting` received both reviews and is being adapted; it will be verified against the 12 criteria above.

---

## Draft (pre-review)

> Status: draft for review (2026-10-31). Owner: Person 2 (front-end). An implementation spike is already running on branch `feat/p2-handwriting` (worktree `/Users/roberiof/Dev/mento-p2-hand`); this plan is the spec it will be reviewed against.

## 1. Why
The product thesis is interactivity: the student must *watch the tutor think on the board*. Today a `write_text` block appears whole, a highlight tints the whole block and the circle is a quick stroke. The founder asked: "write on the canvas instead of rendering the whole block; circle a word as a drawing; even a little brush that does it".

## 2. Goal and success criteria (observable)
1. Every new text on the board (write_text, write_timeline, update_element, ask_verification question) is **written progressively**, grapheme by grapheme in reading order, preserving the sanitized HTML (h1–h3, p, b, i, ul/ol/li, br).
2. A **pen** (inline SVG, tip at the writing point) travels with the writing caret, then along the circle path, then across the highlight sweep; it fades when idle.
3. `circle_annotate` is drawn by the pen around the matched text **after** that text is written. `highlight` becomes a **marker sweep** (left→right, line by line) instead of a flat tint.
4. The follow camera looks at what is being written.
5. Nothing animates on: replayed lessons (`replayEvents`/`restore`), elements present on mount, `prefers-reduced-motion`, or an interruption (pending writing completes instantly).
6. Click-and-ask and text selection work on partially written elements; `data-element-id` unchanged.
7. No jank: panning while writing stays at 60 fps on a mid laptop.

## 3. Timing model (the hard part)
- **Speech is the clock** (rendering guide §5): the queue blocks on each `speak` only. Board actions apply immediately. Writing must therefore run *in parallel* with the next speak, not block it.
- Writing speed ~35–50 chars/s with jitter; cap ~4 s per element (faster for long blocks). Board text is short by prompt rule (title + ≤3 bullets of ≤8 words), so most blocks take 1–2.5 s.
- **Write queue per board**: elements of the same turn are written in arrival order, one at a time; annotations wait for their target's writing to finish.
- **Sync with voice (option, decide in review)**: (a) independent speed (simple), or (b) stretch the writing of an element to the duration of the speak that follows it (uses `speech_alignment` / text clock). Proposal: start with (a); (b) is a follow-up.
- Interruption / new turn: flush the write queue instantly (all text visible), then process new actions.

## 4. Technical approach
- `packages/board/src/board/write/` (new):
  - `revealPlan.ts` (pure): walks the rendered element's text nodes → ordered list of grapheme ranges (Intl.Segmenter), with line breaks; unit-tested across nested tags.
  - `useWriter.ts`: rAF loop that reveals ranges by toggling a CSS class / clip on pre-split spans (split once on mount, no React re-render per char), reports caret position (Range.getBoundingClientRect → world coordinates via the camera scale).
  - `writeQueue.ts` (pure + tested): ordering, caps, flush, skip-on-replay.
- `Pen.tsx`: single absolutely positioned SVG in the canvas world layer; position written to `style.transform` from the writer/circle/highlight loops; eased follow, fade-out after 400 ms idle.
- `CircleLayer.tsx`: stroke animation driven by the same loop; pen follows `path.getPointAtLength`.
- `HighlightLayer.tsx` (new): per-line rects from `Range.getClientRects()`, sweep via scaleX animation, colors per guide §4.5, ~65 % opacity, slight irregular edges.
- Renderers mark freshly created elements "to write"; replay/restore pass a flag so the store marks them "already written".
- Camera: `useCanvasCamera` gets `followRect(rect)` used by the writer for the current line.

## 5. Out of scope
Structured diagrams (Plan B), backend/prompt changes (Plan C), stroke-by-stroke glyph tracing of the font (we reveal glyphs, we don't trace their outlines), sound effects.

## 6. Risks
- Long blocks or many elements per turn could lag behind speech → cap + flush on next turn.
- `Intl.Segmenter` support (all evergreen browsers OK).
- Accessibility: screen readers should get the full text at once (aria-live off during writing; the element's text is in the DOM from the start, only visually hidden).
- Performance with many spans: split only new elements; unwrap spans after writing completes.

## 7. Validation
Unit tests (reveal plan, queue, caps, skip-on-replay); browser on `/dev/board` with `rome-intro` and `click-and-ask` fixtures and a live lesson on the real API; reduced-motion pass; panning while writing.

## 8. Estimate
~4–6 h front-end. No contract change.
