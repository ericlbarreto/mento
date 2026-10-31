# Plan F — The student edits the board: delete and rearrange blocks

## FINAL (merged after independent reviews: Lua = product, Íris = interface, architect = data)
All three say: worth it, **F1 (reorder in columns) only**, never free positioning; build in slices; the draft underestimated the work (architect: 17–23 h for everything).

**Scope decision needed:** not in Must/Should → founder OK + new decision entry (D79).

**Resolved disagreement (tap):** Íris wanted tap = select only (asking moves to the toolbar); Lua wants one click to still ask (click-and-ask is Must #2). Merged rule: **one tap/click selects the block AND sets the "Sobre: …" chip** (as today) and shows the toolbar; on touch it **does not focus the chat** (no keyboard pop-up) — the student types or speaks when ready.

**Interaction (front)**
- Toolbar: pill on `--card` + `--shadow-pop`, 8 px above the block's top-right (below if the top is off-screen), screen-sized (doesn't shrink with zoom), **44×44 px** buttons with pt-BR aria-labels: Mover (handle), Apagar; `data-board-control` so the camera ignores it. Hidden below zoom 0.6.
- Selection outline 2 px `--mento-blue`, 4 px offset (distinct from the focus ring).
- **Drag only from the Mover handle** (no long-press); starts after 6 px; touch elsewhere keeps panning; mouse on text keeps selecting text.
- Reorder (F1): 3 px blue insertion bar, slot switches at the neighbour's 50 % midpoint, ghost 0.6 opacity rotated 1°, reflow 240 ms ease-out; drop outside snaps back; auto-scroll near edges (48 px, ≤ 12 px/frame); follow camera suspended during drag + 4 s.
- Delete: fade + scale 0.97 (150 ms) then collapse (240 ms); undo toast **top-center of the board** (never near caption/orb), 6 s, pauses on hover/focus; Ctrl/⌘+Z. Undo only restores the last deletion.
- Keyboard: Delete/Backspace on a selected block (never when focus is in the chat input), M = move mode (↑/↓ position, ←/→ column in slice 3), Enter/Space drop, Esc cancel; `aria-live` announcements; reduced motion keeps the insertion bar, no ghost motion/reflow animation.

**Guards (states)**
- A block being written, or from the turn still playing, shows no Apagar/Mover until it is done.
- An unanswered `ask_verification` cannot be deleted (can be moved); once answered it can; stored evidence unchanged.
- Image placeholder: movable, not deletable until the image lands; a `draw_result` for a deleted id is dropped.
- Deleting the selected block clears the "Sobre:" chip.
- New tutor blocks arriving during a drag don't move the insertion bar; they append at the end of their column.

**Data (contract + API, additive)**
- Endpoint `POST /api/sessions/:id/board` `{ edit_id (client uuid), op: "remove" | "move", element_id, column?, after_id: string | null }` — not inside `TurnRequest.appended` (lost on tab close, capped at 5).
- Events `board_element_removed { element_id, edit_id }`, `board_element_moved { element_id, column, after_id, edit_id }`, added to `EventType` (else `SessionDetailResponse` parsing rejects the session) and the `SessionEvent` union.
- Idempotent: dedupe on `edit_id`; removing an already-removed element → 200 `already_removed`; 404 only for an id that never existed; moves are absolute.
- **Anchor with `after_id`, not an index** (the server stores tutor actions ahead of what the student has seen).
- The route goes through the engine (`engine.applyStudentEdit`) so the in-memory runtime board and persistence stay ordered (`queueFor(session_id)`); repo fallback when no engine.
- **Undo without a restore event:** the client holds a delete for 6 s and sends it when the toast closes, on `pagehide` (keepalive) and before any turn is sent.
- Client: `applyEdit` reducer + store method; `replayEvents` returns interleaved steps (actions + edits); `restore()` accepts them.
- Tutor `Board`: per-column order arrays (today `snapshot()` uses insertion order) + **tombstones**: actions on a deleted id fail validation ("deleted by the student; do not reference or re-create it"), a write reusing the id is rejected; the Board section gets one neutral line "Removed by the student: id (type)".
- **Privacy (rule 6):** these events never reach the analysis input or any teacher route, not even counts; a unit test asserts it.

**Acceptance (testable):** click still sets the chip; Apagar removes block + annotations < 200 ms and Desfazer restores it in place within 6 s; reopen shows the same deletions/order; the tutor's snapshot excludes deleted blocks and lists the student's order; bench: 0 re-created deleted blocks in 10 runs unless asked; 44 px targets; toast never overlaps caption/orb; reduced motion OK.

**Slices**
1. **Demo slice (~6–8 h):** select + toolbar, Apagar with deferred undo, endpoint + events + tombstones + replay, guards, privacy test.
2. Reorder **within a column** via the handle, with keyboard (~5–7 h).
3. Move **between columns** (width differences: diagrams/images must fit `side`) (~3–4 h).

---

## Draft (pre-review)

> Status: draft for review (2026-10-31). Owner: Person 2 (front-end) + a small additive back-end change. Nothing implemented.

## 1. Why
Founder (pt-BR): "Quero conseguir apagar blocos de texto que o agente colocou, além de reorganizar esse texto da melhor forma, com drag and drop dentro do canvas." The board is the student's notebook: they should be able to clean it up and arrange it the way they understand it. This reinforces interactivity (the product's main focus) and ownership.

## 2. What exists (main, 2026-10-31)
- The board is a pannable canvas (`packages/board/src/board/Board.tsx`, camera in `useCanvasCamera.ts`) with three **columns** (`main`, `visuals`, `side`); elements stack top-down inside their column in arrival order. The client never receives coordinates.
- Elements: `write_text`, `write_timeline`, `draw` (image), `ask_verification` (question card), `draw_diagram`; annotations (`highlight`, `circle_annotate`) target an element id. The tutor can `update_element` and `remove_element`.
- Click-and-ask: clicking an element sets the "Sobre: …" chip; text selection inside an element works; a drag on the background pans the canvas.
- The tutor's view of the board is rebuilt from stored `tutor_action` events (`packages/tutor/src/board.ts`, `snapshot()` lists ids and text), and so is the student's board on reopen (`replayEvents`).
- No student-originated board events exist yet (`session-events.ts`).

## 3. Proposal

### 3.1 Interactions (front)
- **Select**: click an element → it gets a selection outline and a small toolbar above its top-right corner: **Mover** (drag handle), **Apagar** (trash), and the existing **Perguntar sobre isto** (click-and-ask). Click on background / Esc deselects. Keyboard: Tab to an element, Enter selects, Delete/Backspace deletes (with undo), arrow keys move when in move mode.
- **Delete**: removes the element (and its circles/highlights) from the board with a short fade; a toast "Bloco apagado · Desfazer" for 6 s. Questions still open (`ask_verification` unanswered) cannot be deleted (or deleting skips it to the next turn — decide).
- **Rearrange**: drag the handle (or long-press on touch) to move the block. Two options to decide:
  - **F1 Reorder within/between columns** (snap): the block moves to a slot in `main`, `visuals` or `side`; others reflow. Simple, keeps the tidy layout, robust for replay and for the tutor's camera.
  - **F2 Free position**: the block is placed at any (x, y) in the canvas world; may overlap; the camera/follow logic and "where does the next tutor block go" become harder.
  - **Recommendation: F1 first** (reorder + move between columns), F2 later if needed.
- Drag must not fight with canvas panning (background drag = pan; handle drag = move) or with text selection / click-and-ask.

### 3.2 Persistence and the tutor (additive back-end)
- New student board events, stored like other session events and replayed:
  - `board_element_removed { element_id }`
  - `board_element_moved { element_id, column, index }` (F1) — or `{ x, y }` for F2.
- Endpoint: `POST /api/sessions/:id/board` with `{ op: "remove" | "move", … }` (validated with Zod; idempotent; 404 for unknown element).
- `replayEvents` applies them in event order after the tutor actions they refer to → reopening a lesson shows the student's arrangement.
- The tutor's `Board` (`board.ts`) applies them too, so `snapshot()` no longer lists deleted blocks and the order reflects the student's arrangement; the prompt gets one line: "The student may delete or move blocks; never re-create a block the student deleted unless they ask."
- New tutor blocks after a student move are appended at the end of their column (no conflict with the student's order).
- Teacher analysis: ignore these events (no pedagogical inference from deletions — rule 6), or log only counts.

### 3.3 Out of scope
Editing the text of a block, multi-select, resizing, student-drawn ink, undo beyond the last delete, collaboration.

## 4. Acceptance (draft)
1. Clicking a tutor block selects it and shows Mover / Apagar / Perguntar; Esc deselects.
2. Apagar removes the block and its annotations in < 200 ms; Desfazer within 6 s restores it in place.
3. Dragging a block reorders it inside its column or moves it to another column; others reflow smoothly; background drag still pans.
4. Reload/reopen shows the same deletions and order.
5. The tutor's next reply does not reference or re-create a deleted block, and appends new blocks after the student's arrangement.
6. Keyboard and touch work; reduced motion: no reflow animation.
7. Nothing breaks the live writing (Plan A): a block being written can't be moved until finished (or finishes instantly on grab).

## 5. Estimate
Front (selection, toolbar, delete+undo, F1 drag with reflow, replay) 5–7 h; back (events, endpoint, Board/replay, prompt line, tests) 2–3 h.

## 6. Open questions
- F1 vs F2.
- Can the student delete the tutor's open question card?
- Should the tutor be told *that* the student deleted something (e.g. to adapt), or only see the resulting board?
- Should the student's arrangement be visible to the teacher (e.g. "this student reorganized the board") — privacy/rule 6.
