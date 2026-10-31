# Plan B — The tutor draws structured diagrams (e.g. forces on blocks)

## FINAL (merged after independent reviews: Lua = product scope, architect = contract and reliability)
Both reviewers back option B3 (a diagram spec of primitives drawn by the front-end). The merged design below overrides the draft.

**Founder decisions needed first**
1. **Scope change:** physics/math diagrams are not Must/Should and D2 says "no math in the demo"; the Matemática subject now exists. Approve as a scope change → new decision that also **supersedes D21** ("structured SVG streamed by a second LLM call").
2. **Owners:** contract + fixture proposed by Person 2, approved by Person 3; resolver, tool, prompt by Person 3; renderer by Person 2. Never blocks the History demo path.

**Contract (additive)**
- New action `draw_diagram` (not `draw` + `is_structured`; the server forces `is_structured=false`; `svg_chunk` stays unused).
- `DiagramBase` (what the model sends) → server **resolver** → `DiagramArgs` (absolute geometry; the only thing the client and replay see; persisted resolved).
- Frame presets `wide | square | tall` (no model-chosen viewBox); integer grid 0–100 on the short side, y down; ≤ 24 shapes; plain-text labels ≤ 40 chars.
- Primitives (slice 1): `rect`, `line`, `arrow`, `text`, `axes`, `polyline`, `point`. Arrows are **anchored**, not absolute: `arrow { from: {ref: "bloco", side: "top"}, dir: "up", magnitude: 20, label: "N" }`. `axes`/`point` in data units, mapped by the server. Drop `curve` (undefined) and `circle` from slice 1.
- `highlight` / `circle_annotate` get an optional `shape_id` to target one shape; `text_to_match` keeps working on labels.

**Back-end (Person 3)**
- Pure resolver in `packages/tutor`: anchors → points, magnitude → length, labels offset past arrow tips and nudged off boxes, fit-to-frame scaling (no clamping distortion); unresolvable shapes dropped, empty diagram dropped.
- Tool `draw_diagram` with when-to-use; `prompts/base.md` rule 7 reworded (`draw` = scenes without text; `draw_diagram` = exact shapes, arrows, numbers, labels) + two worked examples (free-body diagram, block on an incline); `board.snapshot` lists shape ids and labels.
- Update exhaustive switches: `tutor/board.ts` (validate/created/snapshot), board reducer + `ElementType`, `defaultHandlers`, `useSessionController.ts`, `lib/api.ts`, `dev/conversation/page.tsx`.
- `maxTokens` 2048 is enough for 24 shapes (~800 tokens) — that is why the cap exists.

**Front-end (Person 2)**
- `DiagramRenderer`: React-built SVG from typed data (never innerHTML), width = column, frame viewBox; hand-drawn look via roughjs `generator.toPaths()` seeded by hash(element id + shape id); labels in `--font-board`; shapes drawn in order with dash-offset (≤ 2.5 s total), Plan A pen follows when available (not a dependency); static on replay / reduced motion; `shape_id` targets measured like `CircleLayer`.

**Acceptance**
- "Me explica a 2ª lei de Newton com um bloco" → within 3 s of the action: block on a floor line with labeled arrows F (right), P (down), N (up); lengths follow the stated values; every label pt-BR, inside the frame.
- Invalid spec → partial diagram or text fallback, never blank. `circle_annotate` on label "P" circles it. Reload replays identically. A scene request still uses `draw`.
- Demo set: free-body diagram (must), function graph with axes + curve from the Cálculo material (should); number line and geometry next.
- Golden gallery of ~10 requests rendered on a dev page and reviewed before live tests; 3 live phrasings pass. If coordinates still fail, fall back to a `free_body {mass, forces[]}` template expanded server-side.

**Order:** (1) contract PR + `newton-blocks.json` fixture with resolved args + resolver input/output pairs → (2) in parallel: renderer against the fixture | resolver + tests, then tool/prompt/snapshot → (3) golden gallery → (4) live test.

**Estimate:** ~10 h plus ~1 day for resolver + golden set (cross-lane). Risk: no physics material, so answers will be flagged `outside_material` — prefer the Cálculo graph as the grounded example.

---

## Draft (pre-review)

> Status: draft for review (2026-10-31). Cross-lane: contract (shared), tutor/back-end (Person 3), front-end (Person 2). Nothing implemented.

## 1. Why
Physics and math need precise drawings: "a 2 kg block on the floor, F = 10 N to the right, weight P down, normal N up". Today `draw` sends a prompt to an image model (Gemini): ~5 s, artistic, and the prompt forbids text inside images because the generator cannot spell; arrows/labels/proportions are unreliable. The founder: "when thinking about Newton's laws we want the blocks and the forces drawn… I don't know how you'd do it in the backend".

## 2. What exists (verified on main)
- `DrawArgs` has `is_structured: boolean` (`packages/contracts/src/actions.ts`).
- `StreamMessage` already has `svg_chunk { element_id, chunk }` ("structured diagrams; not emitted yet").
- `packages/tutor/src/images/draw-pipeline.ts:82`: `if (action.args.is_structured) return fallback(action); // SVG diagrams are a later plan`.
- Front: sanitizer has an SVG allowlist; board is a pannable canvas; Plan A adds a pen that can follow paths.

## 3. Options

| Option | How | Pros | Cons |
|---|---|---|---|
| B1 Image model (today) | `draw` prompt → Gemini picture | Already works, pretty scenes | Slow, imprecise vectors, no labels, can't animate stroke by stroke |
| B2 Free SVG from the LLM | Tutor writes SVG markup, streamed via `svg_chunk` | Unlimited expressiveness | Hard to validate; security (sanitizer); inconsistent style; tokens; no semantic targets for circle/highlight |
| **B3 Diagram spec (recommended)** | Tutor emits a small JSON list of primitives; the front draws them hand-style with the pen | Precise, fast (no image call), labels OK, animatable in order, each primitive addressable for `circle_annotate`/`highlight`, cheap to validate with Zod | New action in the contract, prompt work, a renderer |
| B4 Templates | `draw_template { kind: "free_body", params }` | Very robust for a few cases | Narrow; each new subject needs code |

**Recommendation: B3, with B4-style helpers later if needed.**

## 4. Proposed contract (additive, `packages/contracts`)
```ts
DiagramArgs = {
  id: ElementId, column: Column,
  title?: string,                       // pt-BR caption
  viewBox: { w: 100, h: 60 } | {w,h},   // abstract units, no pixels
  shapes: Shape[]  (1..40)
}
Shape =
 | { id, kind: "rect",   x, y, w, h, label?, fill?: "none"|"soft" }
 | { id, kind: "circle", cx, cy, r, label? }
 | { id, kind: "line",   from:[x,y], to:[x,y], dashed? }       // floor, axes
 | { id, kind: "arrow",  from:[x,y], to:[x,y], label?, color?: "red"|"blue"|"green"|"ink" }  // forces, vectors
 | { id, kind: "text",   x, y, text (≤40), size?: "s"|"m"|"l" }
 | { id, kind: "polyline"|"curve", points:[[x,y],…] }        // graphs, trajectories
 | { id, kind: "axes",   x, y, w, h, xLabel?, yLabel? }
```
- New action name `draw_diagram` (or reuse `draw` with `is_structured: true` + a `diagram` field). Decision for review: a separate action is clearer for the LLM tool schema and validation.
- Shape ids are addressable: `circle_annotate { target_id: diagram_id, text_to_match }` keeps working for labels; a later `highlight_shape { target_id, shape_id }` could pulse an arrow.

## 5. Back-end (Person 3)
- `packages/tutor/src/tools.ts`: new tool `draw_diagram` with JSON schema from Zod and a description with when-to-use (physics forces, geometry, graphs, simple schemas) vs `draw` (scenes, people, places).
- `prompts/base.md` + subject profiles: rule "use `draw_diagram` for anything that needs exact shapes, arrows, numbers or labels"; one worked example (free-body diagram).
- Validation in the action pipeline: Zod parse, clamp coordinates to viewBox, drop shapes with unknown ids/kinds, cap counts; text sanitized (plain text only).
- Streaming: the whole diagram arrives as one action (tool input streaming is already on for `draw`); no image job, no `draw_result`.
- Persistence/replay: it's a normal `tutor_action`, so history replay works unchanged.

## 6. Front-end (Person 2)
- `DiagramRenderer.tsx` in `packages/board/src/renderers/`: SVG in the element frame, scales to column width; hand-drawn look (roughened lines/arrowheads, Caveat labels), each shape drawn in order by the Plan A pen (path length animation), labels written with the writer.
- Accessible: `<title>`/`aria-label` built from title + labels.
- Mock fixture `fixtures/turns/newton-blocks.json` for development.

## 7. Rollout
1. Contract + fixture (additive) → 2. front renderer against the fixture → 3. tool + prompt + validation on the back-end → 4. live test with "leis de Newton" on the Matemática/Física subject.

## 8. Open questions
- Who owns the tool/prompt change (Person 3) and when.
- Physics material: today only Matemática (Cálculo) and História exist.
- Should the image model still be allowed for physics scenes (e.g. a car crash) alongside diagrams? Proposal: yes, `draw` for scenes, `draw_diagram` for exact figures.

## 9. Estimate
Contract + fixture 1 h; front renderer 3–4 h (after Plan A's pen); back-end tool + prompt + validation 3–4 h.
