# Plan G — Free positioning on the board (student drag anywhere; the tutor places blocks side by side)

## FINAL (merged after independent reviews: architect = data/replay, product/UI = interaction)
Both reviewers back the hybrid (flow + pinned) and agree the live failure is mostly the tutor not knowing the columns' screen positions. Merged decisions (built, D82):

- **Student pins with absolute coordinates.** `place { x, y }` (0–20000; negative is unreachable for the camera), 8 px grid, stepped down so a pinned block never overlaps another pinned block. Pinned blocks live in `free` (their column array is replaced so the column re-renders); drawn in the world layer at their column's width.
- **The tutor never gets coordinates and never measures.** Architect: a client-measured relative placement breaks replay (images/fonts change heights). So `place_element { id, next_to, side }` is stored as a relation (`near`) and drawn as a group (above · left · host · right · below), in a column or pinned; no chains; deleting the host sends the block back to its column.
- **Overlap pass:** a top-down pass pushes flow blocks below pinned boxes (margin-top), and the world gets `minWidth/minHeight` so the camera reaches pinned blocks. It runs on a timer, not rAF, so a hidden tab lays out what it restores (found live).
- **Way back to tidy (product 🔴):** an "Arrumar" button next to Centralizar, shown only when something is placed: one `move` per block back to its column.
- **Selectors:** blocks are found by `data-board-block`, not `[data-column] > …` (product 🔴: pinned blocks would not select).
- **Prompt rule 6 exception:** the tutor may move the block the student asks about; it must say only what it changed. Tool text maps pt-BR phrases (lado a lado, embaixo de, em cima de, junta esses) and says main = left, visuals = middle, side = right. A no-op `move_element` is rejected.
- **Found in live testing:** a request typed while a question was open became the answer and was graded `incorrect` (false evidence for the teacher). The judge now has `not_an_answer` (no evidence) and the tutor is told to do the request instead.
- **Cut from slice 1:** move undo (delete undo unchanged), alignment guides, M-key nudge (keyboard keeps the column reorder of D79), whole-block drag, groups that resize.

---

## Draft (pre-review)

> Status: draft for review (2026-10-31). Owner: Person 2 (board, web) + small additive contract/tutor change. Extends plan F (D79), which chose column reorder only (F1); the founder now asks for F2.

## 1. Why (founder, verbatim, pt-BR)
"Eu queria que o processo de edição e posicionamento dos textos fosse um pouco mais fluido, não baseado em colunas… arrastar ali no Canva… e conseguir adicionar para qualquer lugar." And: "quando eu converso com a gente para ele fazer essas alterações, ele mesmo não consegue."

## 2. Evidence (live test, 2026-10-31, session 6ae5d4f40ad61ddbf1143c70, chat)
| Student asked | Tutor did | Result |
|---|---|---|
| "Apaga aquele quadro de opções do começo" | `remove_element opcoes_estudo` | OK |
| "Coloca as causas antes da linha do tempo, lá em cima" | `move_element causas main after null` | OK |
| "coloca a linha do tempo do lado direito das causas, lado a lado" | `move_element linha main after causas` (no-op: already there) and said "pronto, lado a lado" | **Fail**: columns cannot express "beside"; the tool does not say what the columns mean on screen; the tutor claimed a change that did not happen |

## 3. Model: flow + pinned (hybrid)
- Every element keeps its `column` (its width and where new blocks of the tutor flow). An element may also be **pinned**: `pos: {x, y}` in world px at scale 1 (origin = world top-left). A pinned element leaves its column flow and is drawn absolutely in the world layer, at its column's width.
- **New tutor blocks still flow** at the end of their column (the tutor never computes coordinates).
- **No overlap with the flow:** after each layout change, a top-down pass pushes a flow block down (margin-top) when its box would overlap a pinned box in the same x band (ResizeObserver on the world; one pass per frame).
- World size grows to include pinned boxes (an invisible sizer), so the camera can reach them and "Centralizar"/follow keep working.

## 4. Contract (additive)
- `BoardEditRequest` gains `{ op: "place", edit_id, element_id, x, y }` (finite numbers, clamped −2000…20000).
- Event `board_element_placed { element_id, x, y, edit_id }` (+ `EventType`).
- A `move` (column) on a pinned element unpins it (back into flow).
- New tutor action `place_element { id, next_to: ElementId, side: "right" | "left" | "below" | "above" }`. Resolved on the client from measured boxes (gap 40 px, top-aligned for left/right, left-aligned for above/below) into a pin. Persisted as the action (replay resolves again the same way after layout).

## 5. Student UI
- Drag from the Mover handle (and, new, from a press-and-drag on the selected block's frame outside text) → the ghost follows the pointer; drop anywhere on the board pins the block at the ghost position. No insertion bar, no column drop zones.
- Drop outside the viewport snaps back. Undo (Ctrl/⌘+Z) restores the previous position for 6 s (same toast pattern).
- Keyboard: M then arrows nudge 24 px (Shift = 96 px), Enter commits, Esc cancels.
- A pinned block keeps the toolbar (Mover/Apagar); "Voltar para a coluna" not needed in slice 1.

## 6. Tutor
- Tool descriptions: columns on screen (main = left, visuals = middle, side = right); `place_element` for "lado a lado", "ao lado", "embaixo de", "em cima de"; `move_element` for order inside a column.
- Prompt rule 6: when the student asks to rearrange, do it with the tool and say what changed; never claim a move without the action.
- `Board.snapshot()`: pinned blocks listed as `id | type | placed right of X` or `placed by the student`; an unknown `next_to` fails validation.
- Engine: if the reply says it moved something but has no move/place/remove action, no extra logic in slice 1 (prompt only); measure live.

## 7. Persistence / replay / privacy
- `replayEvents` applies `board_element_placed` in order; `place_element` resolves after the target is mounted (layout effect).
- Analysis and teacher routes ignore the new event (same filter as D79).

## 8. Acceptance
1. Drag a block anywhere and drop: it stays there; reload keeps the position.
2. Tutor block arriving later never overlaps a pinned block.
3. "coloca X do lado direito de Y" in chat → `place_element` → X is beside Y on screen.
4. "coloca X embaixo de Y" → X below Y.
5. Delete, undo, click-and-ask still work on pinned blocks.
6. Camera can pan to a block pinned far to the right/below.
7. Gates green; live chat test in the browser for 3 and 4.

## 9. Estimate
Contract + tutor 1.5 h; board model/render/overlap 3 h; drag/keyboard 1.5 h; live test 1 h.
