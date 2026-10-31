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
| **Subject profile** | How the subject is taught, typical misconceptions, kinds of verification questions, allowed board operations | Material (its subject) |
| **Course context** | **Class context** (grade level and class description from the teacher), excerpts retrieved from the materials of the chosen subject (none in a free session), the student's learner summary (open gaps, recent progress) and the topic | Class (global), material, student, session |

## Class context and grade level

The teacher writes **one global class context** (`06-teacher-interface.md`): a **grade level** (7º, 8º or 9º ano of Ensino Fundamental II) and a free-text **description** of the class. It goes into the course-context layer of **every** conversation.

How the tutor uses it:
- **Register:** vocabulary, sentence length and examples suited to the grade level (roughly 12 to 15 years old); short explanation steps; frequent checks for understanding; warm, encouraging tone; no sarcasm.
- **Examples** that match the class interests and difficulties mentioned in the description.
- **Pacing:** shorter reveals on the board when the description says the class struggles with reading or attention to long text (educational adaptation only, never psychological inference).
- **Safety for minors:** age-appropriate content; refuse and redirect off-topic or unsafe requests.
- The description is **teacher guidance, not a fact source**: facts come from the material; if they conflict, the material wins. The tutor never repeats the description to the student.

Prompt shape (illustrative, English instructions, pt-BR answers):

```
Class context (written by the teacher; applies to all students in this class):
- Grade level: 8º ano (Ensino Fundamental II, Brazil)
- Description: "<teacher text>"
Adapt your language to this level. Answer the student in Brazilian Portuguese.
```

## Prompts are files

For freedom to iterate during testing, prompts are text files, editable by anyone without touching code:

```
prompts/
  base.md                  base tutor prompt
  subjects/
    history.md             History profile (required for the demo)
    math.md                Math profile (nice-to-have sketch)
    generic.md             Fallback profile for materials with subject "Outro" or unknown
```

- `materials.profile_key` (set from the subject chosen at upload) points to the file (e.g., `history`); unknown or "Outro" falls back to `generic`.
- The teacher's **class context** (`class_context.description`) is free text that tweaks every conversation without editing files; subject-specific tweaks go in the profile files.
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

- Use only the retrieved excerpts from the materials of the chosen subject for claims derived from the material.
- **Opening (D47):** the first turn has no student message: greet the student by name in one short spoken sentence and ask what they want to study today (in a subject session, mention the subject).
- **Free session (no material, D47):** use the `generic` profile, answer with general knowledge and set `outside_material: true` on every answer; never invent citations.
- When using an excerpt, emit a citation: `material_id`, `page`, `quote`.
- If the material does not support the answer: say so, answer with general knowledge, and **mark the answer as "outside the teacher's material"**.
- If two sources conflict, say so; do not silently merge them.
- Never claim to know "the teacher's style" from a small sample.

## Modality hint

Each turn includes `modality: voice | text`.
- **Voice:** short, spoken-style sentences; no reading of symbols aloud; push visuals to the board.
- **Text:** may be longer and structured.

## Tools the tutor can call (conceptual)

`speak`, `write_text`, `write_timeline`, `write_latex`, `highlight`, `circle_annotate`, `draw`, `update_element`, `remove_element`, `ask_verification`, `record_evidence` (server-side), `search_materials` (the normal retrieval path for books; the first likely pages are preloaded). Citations travel in `sources` on `speak`/`write_text`. Exact schemas: `16-technical-roadmap.md` §4 (Zod in `packages/contracts`).

## Single orchestrator

One orchestrator with well-defined tools is enough. **No multi-agent systems** for the MVP: deterministic, testable and observable beats clever.

## Evaluating prompt quality

Keep a small set of fixed test conversations for the Rome material (including a wrong answer, a click-and-ask, and an out-of-material question) and rerun them after each prompt change.
