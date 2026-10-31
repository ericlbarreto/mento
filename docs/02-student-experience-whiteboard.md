# 02 — Student experience and whiteboard

> Status: design agreed; exact protocol to be defined in technical discovery. Last updated: 2026-10-30.
> **Update 2026-10-30:** the board technology and the tool protocol in this document are **superseded by `16-technical-roadmap.md`** (DOM board in columns, tutor as a script of tool calls over SSE; no tldraw). Product intent here still applies.

## Overview

> UI layout (orb at bottom center, captions, chips) and the shared design language with the teacher UI are specified in `18-ui-references.md`.

**Start flow (D47):** the student is pre-set (one demo student). The start screen shows **one card per subject** (e.g., História, Matemática) with the **number of materials** for that subject, and a **Mento button** below them. A subject card opens the whiteboard grounded in **all materials of that subject**; the Mento button opens a **free session with no material** (every answer flagged as outside the material). The session **opens in voice**: the tutor greets the student and asks what they want to study; the text chat is always next to the board. The tutor adapts its language to the teacher's **class context** (grade level and characteristics). The screen has three regions:

1. **Board** (center): where the tutor writes and draws, and where the student can annotate and click.
2. **Conversation** (side): text messages, source chips, tutor states ("thinking", "waiting for you").
3. **Material** (collapsible panel): list of PDFs and a viewer that opens at the cited page.

All user-facing text is in pt-BR.

## Interaction modes (two independent axes)

| Axis | Options |
|---|---|
| Modality | text or voice |
| Surface | board + conversation, or chat only |

The toggle changes only what the client sends/renders. Session, history, sources and evidence stay the same. The student can start in text, turn voice on and go back without losing context. **Hackathon: text + board is Must; voice is Should**, but when voice works the session opens in voice (D47); if voice fails, the same greeting appears in the chat and the student types.

## Board principle

The tutor **does not deliver a finished image**. It builds the explanation **in steps**, synchronized with speech/text. The board is **structured and bidirectional**, not decorative.

### What the tutor can place on the board (hackathon, History)

| Tool (see `16-technical-roadmap.md` §4) | Use |
|---|---|
| `write_text` | titles, explanatory blocks, labels (handwritten HTML) |
| `write_timeline` | deterministic timeline with exact dates |
| `draw` | illustration (generated image) or structured diagram (streamed SVG), e.g., Colosseum, aqueduct, map |
| `highlight` | marker-style emphasis on an element |
| `circle_annotate` | circle a substring inside an element |
| `ask_verification` | question on the board; the tutor waits for the answer |
| `update_element` / `remove_element` | change or remove an element |
| `speak` (+ `sources`, `outside_material`) | speech/caption with citation chips |

Equations and function graphs exist in the general design (math) but are **not a priority** in the History demo.

### What the student can do

- **Click an object and ask about it** (the key interaction of the demo).
- Draw/annotate, highlight, write in a text box.
- Ask for a hint, another example, another representation; go back a step.
- Answer the tutor's questions.

The system distinguishes **exploratory annotation** from **final answer**; a draft is not evidence of error.

## Click-and-ask

Flow: the student selects an object (e.g., the date "27 BC" on the timeline) and asks "why that date?". The client sends `board_select` with `object_id`, object content and the question. The tutor receives the current board state, the selected object, the current concept and the relevant excerpts from the chosen material; it answers specifically about that element and may **add an annotation** without restarting the conversation.

## Drawings (illustrations)

Strategy for "draw a Colosseum", aiming for human and reliable:

1. **Curated library** of 4 to 6 key Rome illustrations (SVG): fast and good-looking.
2. **LLM-generated SVG** as a complement, in a simple style (few strokes, thick outline, cartoon).
3. **Stroke animation** with `stroke-dasharray`/`stroke-dashoffset` for the "being drawn live" effect (~2s, alongside speech).
4. **Pre-generate and cache** everything that will appear in the demo.

> [Unverified] We found no ready-made project showing a tutor drawing illustrations stroke by stroke; this combination is our own proposal and must be tested early. Converting arbitrary SVG into tldraw's native `draw` shape was not verified; a custom shape that embeds the SVG is the simplest path.

## States and latency

The board is never blocked without feedback. Visible states: "analyzing", "preparing explanation", "waiting for your answer". Latency must be measured from the start.

## Persistence

The board is a **structured document with events**, not an image. Every event (object created, question, answer, hint) goes to the database log. This enables resuming, auditing and (later) replay.

## Accessibility and devices

Hackathon: laptop. Future: tablet, keyboard navigation, screen readers, low connectivity. See the brief (section 5.9).

## Competition (do not assume differentiation)

AI boards already exist (e.g., Gauth launched an "Unlimited Digital Canvas" on 2026-10-01; per the release, element-level Q&A, animation and 3D were *planned*). Our differentiator is not "having a board": it is the board **tied to the teacher's material and to evidence**. See `09-market-and-competitors.md`.
