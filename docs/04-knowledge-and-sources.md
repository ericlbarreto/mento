# 04 — Knowledge and sources (materials)

> Status: **rewritten 2026-10-30** for the simplified model: the teacher uploads **materials** (PDFs such as books); there is no subject → lesson hierarchy. Retrieval and cost choices for **books** are hypotheses to test on day 0. Last updated: 2026-10-30.

## Goal

The tutor answers from what the teacher actually uses, and the student can **see where each explanation came from**. The link between a conversation and its PDF is **explicit**: the student chooses the material; the AI never guesses.

## Materials

- A **material** is an uploaded PDF (typically a book or chapter): `title`, `subject` (História, Matemática, Ciências, Português, Geografia, Outro), `profile_key` (selects the subject profile in `prompts/subjects/`, `generic` if unknown), `status`, `page_count`, `outline`.
- There is **one teacher workspace**: all materials belong to it (no per-class or per-teacher scoping).
- At session start the student **picks one material** (and optionally types a topic). The conversation is scoped to that material: its subject profile, its retrieval index and its citations.
- A question outside the material gets a general-knowledge answer, visibly marked **"outside the teacher's material"**.
- Future: studying across several materials at once (not in the hackathon).

## Getting a material in

| Path | When | Notes |
|---|---|---|
| **UI upload** (Materials tab) | Should (`01` item 9c) | Multipart `POST /api/materials`; starts a **background ingestion job**; the tab shows status |
| **Script** `scripts/ingest.ts` | **Must (fallback)** | Reads a PDF from `materials/` (git-ignored) and runs the same pipeline; used to pre-ingest the demo book |

Both paths call the same `@mento/sources` pipeline.

## Ingestion pipeline (per PDF)

1. **Store the file** and create the `materials` row (`status: queued`).
2. **Extract per-page text.** *Hypothesis:* use the PDF **text layer first** (cheap and exact for highlighting); send **only pages that need it** (images, tables, equations, scanned pages) to a model that reads the page image and returns Markdown. Reading every page of a book with a vision model is expensive; test cost and speed on the real book.
3. **Chunk by page** (one chunk per page, optionally split long pages), keeping `material_id` and `page`.
4. **Build the search index** (MongoDB text index over chunks, `default_language: "portuguese"`).
5. **Build the outline** (chapters with page ranges) from the table of contents or by an LLM over the first pages and headings; used to scope retrieval and to display "Capítulo 3".
6. Set `status: ready` (or `failed` with a reason). While processing, report `processed_pages / page_count`.

**Limits for the hackathon:** cap pages per material (hypothesis: a few hundred); pre-ingest the demo book before the demo; large uploads during the demo are not recommended.

## Retrieval: books do not fit in context

The earlier plan ("put the lesson's pages in context") only works for a few dozen pages. With books:

1. **If the material is small** (fits comfortably in context): include all pages (prompt-cached).
2. **Otherwise (default for books):** retrieve **top-k pages** with **FTS** from the student's **topic** and the current question, **plus the outline chapter** that best matches the topic. Include only those pages in the turn's context.
3. The tutor may call `search_materials(query)` mid-turn when it needs more (the normal path for books); with voice, preload the likely pages at session start to avoid a tool round trip in the middle of speech.
4. **Embeddings** only if FTS recall proves insufficient (upgrade, not a hackathon default).

Citations always carry `material_id`, `page`, `quote`, whichever path retrieved the page.

## Citation and highlight

A citation carries `material_id`, `page`, `quote`. The frontend opens the PDF at `page` and **highlights `quote` by searching the PDF text layer** (pdf.js). Because step 2 above prefers the text layer, extraction and highlighting share the same text.

| Option | Highlight | Cost | Risk |
|---|---|---|---|
| **Text-layer extraction (+ vision only where needed); highlight via text search in pdf.js** | Exact excerpt when the PDF has selectable text | Low, no extra vendor | Scanned PDFs fail; test the book early |
| **Reducto-style parsing service (bounding boxes)** | Precise rectangle, works on scans | Medium (account, credits, vendor) | One more dependency |

**[Decision]** Use the first option. *[Unverified]*: we did not research Reducto's pricing or retention.

## Citation validation and playback

- `sources` travel on `speak`/`write_text` as `[{material_id, page, quote}]`.
- **Server-side check:** the `quote` must occur in the cited chunk; otherwise the chip is dropped (prevents fabricated citations).
- The model marks answers not supported by the material with `outside_material: true`; the UI shows a visible tag.
- The client opens the PDF drawer at `page` and highlights `quote`. See `16-technical-roadmap.md` §6.

## What the student sees

- At start: **pick your name → pick a material → optional topic** (`02-student-experience-whiteboard.md`).
- **Chips** on tutor messages, e.g., `Livro, p.12`; click opens the PDF at the page with the excerpt highlighted.
- A distinct marker when an answer is outside the material.

## What the teacher sees

The **Materials tab** (`06-teacher-interface.md`): upload, processing status, list. Gaps in the Students tab link back to the page that was being discussed.

## Material types

`materials.type` ∈ `pdf | transcript`. `transcript` is reserved for the future classroom-transcription feature (nice-to-have 17) and needs no schema change.

## Caveats

- **Copyright:** upload material the team has the right to use (open educational resources, public domain, self-authored); check hackathon IP rules.
- **Cost and time:** books can be hundreds of pages; ingestion may take minutes. Show progress; never block the UI.
- **Scanned PDFs:** need OCR or the vision path; highlighting may degrade.
- **Conflicting passages:** tell the user; do not merge silently.
- **Class context is not a source:** it shapes tone and level, not facts.
