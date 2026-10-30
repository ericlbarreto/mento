# 04 — Knowledge and sources

> Status: design agreed; implementation choices to confirm in discovery. Last updated: 2026-10-30.

## Goal

The tutor answers from what the teacher actually teaches, and the student can **see where each explanation came from**. The link between a subject and its PDFs is **explicit**, never inferred by the AI.

## Subject → lesson → source linkage

```
Subject (id, name, profile_key) → Lesson → Source → Chunk (page, text)
```

- Every document is ingested already tied to a subject and a lesson (by folder name or registration).
- The student chooses subject and lesson when opening a session; the session stores `lesson_id`.
- Retrieval **filters by `subject_id` and `lesson_id`**. The tutor can never consult another subject's PDF.
- A question outside the material gets a general-knowledge answer, visibly labeled "outside the teacher's material".

## Ingestion (script, no UI)

Folder convention (see `materials/README.md`):

```
materials/<subject>/<lesson>/<file>.pdf
```

`ingest` script, per PDF:

1. Convert page by page to Markdown (a model with PDF/vision reading is preferred over plain text extractors, especially for math and layouts).
2. Chunk by page or section, keeping `source_id` and `page`.
3. Optionally tag chunks with concepts (LLM). For the hackathon, concept = free text, no prerequisite graph.
4. Store in the database.

Run it **before the demo**. Large books are never ingested live.

## Retrieval: start simple

1. **Default:** for a lesson with 2 to 3 PDFs and a few dozen pages, **put all the lesson's pages directly in the model context** (with prompt caching) and ask the model to cite `source_id`, `page` and `quote`. No embeddings or vector DB.
2. If material is too large or slow/expensive: database full-text search (FTS) filtered by lesson.
3. Embeddings only if both fail.

With voice, avoid a retrieval tool call mid-speech (latency): preload the lesson's key chunks at session start.

## Citation and highlight

A citation carries `source_id`, `page`, `quote`. The frontend opens the PDF at `page` and **highlights `quote` by searching the PDF text layer** (e.g., with pdf.js).

| Option | Highlight | Cost | Risk |
|---|---|---|---|
| **Model reads PDF → Markdown per page; highlight via text search in the pdf.js text layer** | Exact excerpt when the PDF has selectable text | Low, no extra vendor | Scanned PDFs fail; test early |
| **Reducto-style parsing service (bounding boxes)** | Precise rectangle, works on scans | Medium (account, credits, another vendor) | One more dependency in 24h |

**[Decision]** Use the first option. Reducto stays as an upgrade if the PDFs turn out to be scanned. *[Unverified]*: we did not research Reducto's pricing or data retention.

## What the student sees

- **"Lesson material" panel:** list of PDFs for the lesson.
- **Chips on tutor messages:** e.g., `Slides, p.12`; click opens the PDF at the page with the excerpt highlighted.
- A distinct visual marker when an answer is outside the material.

## What the teacher sees

Materials per subject and lesson (read-only for the hackathon). Upload through the UI is a nice-to-have; the script is the hackathon path. See `06-teacher-interface.md`.

## Source types

`Source.type` ∈ `pdf | book | slides | transcript`. `transcript` is reserved for the future classroom-transcription feature (nice-to-have 17) and requires no schema change.

## Caveats

- **Copyright:** use material the team has the right to use (open educational resources, OpenStax, public domain, or self-authored). Check hackathon IP rules.
- **Cost:** ingesting entire books with a vision model is not cheap; limit to a few hundred pages.
- **Conflicting sources:** tell the user; do not merge silently.

## Citation validation and playback (added from the technical roadmap)

- `sources` travel on `speak`/`write_text` as `[{source_id, page, quote}]`.
- **Server-side check:** the `quote` must occur in the cited chunk; otherwise the chip is dropped (prevents fabricated citations).
- The model marks answers not supported by the material with `outside_material: true`; the UI shows a visible tag.
- The client opens the PDF drawer at `page` and highlights `quote` in the pdf.js text layer. See `16-technical-roadmap.md` §6.
