# 03 — Tutor and prompts

> Status: design agreed; prompt files to be written during the build. Last updated: 2026-10-30.
> **Update 2026-10-30:** the board technology and the tool protocol in this document are **superseded by `16-technical-roadmap.md`** (DOM board in columns, tutor as a script of tool calls over SSE; no tldraw). Product intent here still applies.

## Goal

The tutor must be able to teach *any* subject (history, math, etc.), and teaching differs by subject. "You are an expert in history" in a prompt proves nothing. What works is **structure per subject**: a *subject profile* added on top of a base prompt.

## Three-layer prompt

The prompt for each turn is assembled from three layers by plain string concatenation (no prompt framework):

| Layer | Content | Changes by |
|---|---|---|
| **Tutor base** | Pedagogy (explain, probe, hint, verify), citation rules, honesty when no source exists, style per modality (voice vs text), always answer in pt-BR | Never |
| **Subject profile** | How the subject is taught, typical misconceptions, kinds of verification questions, allowed board operations | Subject |
| **Course context** | Lesson objective, excerpts retrieved from the teacher's PDFs, learner summary | Lesson and student |

## Prompts are files

For freedom to iterate during testing, prompts are text files, editable by anyone without touching code:

```
prompts/
  base.md                  base tutor prompt
  subjects/
    history.md             History profile (required for the demo)
    math.md                Math profile (nice-to-have sketch)
```

- `subjects.profile_key` in the database points to the file (e.g., `history`).
- `subjects.prompt_notes` is a free-text field for quick per-subject tweaks without editing files.
- Instructions are written in **English**; the model is told to answer the student in **pt-BR**.

## Subject profile contents (what makes it real)

A profile should state, in concrete terms:

- **Teaching method** for the subject.
- **Typical misconceptions** to watch for.
- **Verification question types** (what counts as a transfer question in this subject).
- **Allowed board operations** and how to use them.
- **Source handling** (e.g., primary source vs interpretation).

### History (demo)

- Teach through causality and context, not isolated dates.
- Use timelines and maps; use illustrations to anchor concepts.
- Avoid presentism; distinguish primary source from interpretation.
- Typical misconceptions: confusing Republic and Empire; treating "fall of Rome" as a single event.
- Verification: ask the student to explain a cause–effect chain or to place a new event on the timeline.
- Board: `timeline`, `illustration`, `map`, `arrow`, `label`, `highlight`.

### Math (sketch, nice-to-have)

- Solve step by step; ask the student to explain their reasoning.
- Typical misconceptions: sign errors; confusing inner and outer function.
- Board: `equation`, `graph` (not needed in the History demo).

## Pedagogical behavior (base prompt rules)

- Core loop: **teach → ask → observe → diagnose → adapt → practice → verify → review.**
- Strategies: explain, probe, hint, worked example, guided practice, independent practice, transfer, alternative representation.
- **Not excessively Socratic:** if the student asks for a direct explanation, give it; if they are practicing, encourage reasoning before revealing.
- Do not conclude a misconception from a single error: form a hypothesis, ask a discriminating question, gather more evidence.
- A verification question must be **new**, not a repeat of the example.
- Treat drafts/annotations as exploratory, not as errors.

## Grounding and citation rules

- Use only the retrieved excerpts from the current subject and lesson for claims derived from the material.
- When using an excerpt, emit a citation: `source_id`, `page`, `quote`.
- If the material does not support the answer: say so, answer with general knowledge, and **mark the answer as "outside the teacher's material"**.
- If two sources conflict, say so; do not silently merge them.
- Never claim to know "the teacher's style" from a small sample.

## Modality hint

Each turn includes `modality: voice | text`.
- **Voice:** short, spoken-style sentences; no reading of symbols aloud; push visuals to the board.
- **Text:** may be longer and structured.

## Tools the tutor can call (conceptual)

`speak`, `write_text`, `write_timeline`, `write_latex`, `highlight`, `circle_annotate`, `draw`, `update_element`, `remove_element`, `ask_verification`, `record_evidence` (server-side), `search_materials` (only if the lesson does not fit in context). Citations travel in `sources` on `speak`/`write_text`. Exact schemas: `16-technical-roadmap.md` §4 (Zod in `src/contracts`).

## Single orchestrator

One orchestrator with well-defined tools is enough. **No multi-agent systems** for the MVP: deterministic, testable and observable beats clever.

## Evaluating prompt quality

Keep a small set of fixed test conversations for the Rome lesson (including a wrong answer, a click-and-ask, and an out-of-material question) and rerun them after each prompt change.
