# Prompt log — Person 2 · Whiteboard front-end

> Add one row per entry. Entry files live in this folder (`YYYY-MM-DD-hhmm-<topic>.md`, from `_template.md`).

| Date (UTC) | Title | Task id | Entry file | Commit |
|---|---|---|---|---|
| 2026-10-30 20:00 | Wave 1: protocol mirror + mock, design system | T0, T1 | [2026-10-30-2000-wave-1-protocol-and-design-system.md](2026-10-30-2000-wave-1-protocol-and-design-system.md) | PR #1 + T1 PR |
| 2026-10-30 21:00 | Wave 2: board core, start screen, orb | T2, T3, T8, T10 | [2026-10-30-2100-wave-2-board-core-start-orb.md](2026-10-30-2100-wave-2-board-core-start-orb.md) | PRs #3, #4 + T2/T3 PR |
| 2026-10-30 23:30 | Plan v2: Stitch student pages on the real API; track K (API + contracts) | K | [2026-10-30-2330-stitch-student-pages-plan.md](2026-10-30-2330-stitch-student-pages-plan.md) | feat/p2-api-contracts |

## Every prompt, verbatim (bulk export)

All 201 prompts Robério typed in the 25 local Claude Code sessions of this repository, plus one Mento conversation opened from another project folder (2026-10-30 → 2026-10-31) are in [`prompts-verbatim-2026-10-30-31.md`](prompts-verbatim-2026-10-30-31.md), in the original Portuguese. One row per conversation (and per phase of the long main session); the prompt numbers point into that file.

| Start (UTC) | Conversation / phase | Prompts | Outcome | PRs |
|---|---|---|---|---|
| 2026-10-30 20:43 | [Before the repo: Studdy research and clone](prompts-verbatim-2026-10-30-31.md#studdy) | P2-001–003 | Researched the Studdy AI competitor (later `docs/15-studdy-teardown.md`), then cloned the Mento repo. | — |
| 2026-10-30 21:10 | [Main session](prompts-verbatim-2026-10-30-31.md#main): study, architecture, Stitch, the wave plan | P2-004–021 | Studied the repo as Person 2, explained the package layout and the Next.js contract gaps, tried Google Stitch for screens, ran waves 1–2 (protocol mock, design system, board core, start screen, orb). | #1–#6 |
| 2026-10-31 02:15 | Main session: Stitch student pages, plan v2 and reviews | P2-022–060 | Planned the seven Stitch student screens on the real API with two independent plan reviews; teacher UI fixes (one subject per teacher, no class notes); merged the Stitch chrome, home and session screen; bigger logo. | #10–#16 |
| 2026-10-31 03:15 | Main session: real API, MongoDB, tutor audio, history | P2-061–086 | Ran against the real API and the `.env` MongoDB (no Docker); fixed tutor audio and voice sessions; lesson history drawer and reopen; spoken conversation with barge-in; circle annotations; subject card opens the history; a Matemática subject from a PDF. | #18–#27 |
| 2026-10-31 04:49 | Main session: session controls clean-up | P2-087–093 | Removed the pause button; opening the mic silences the tutor; removed the simulated badges and the API status tag. | #29–#33 |
| 2026-10-31 05:22 | Main session: plans A–C | P2-094–102 | Detailed, agent-reviewed plans for a handwriting board, exact diagrams and "every reply writes on the board"; spoken-text layer for TTS. | #36–#41 |
| 2026-10-31 05:58 | Main session: demo materials, real pause, teacher PDFs | P2-103–114 | Four original 8º-ano books as demo materials; real pause that resumes mid-word; teacher Materials tab without upload; better exercise-list PDFs. | #43–#47 |
| 2026-10-31 06:58 | Main session: fewer writes, formulas aloud, board editing | P2-115–123 | The tutor writes only when the lesson continues; formulas read aloud; the student and the tutor delete and rearrange board blocks. | #49–#52 |
| 2026-10-31 10:28 | Main session: teacher gaps, voice numbers, free positioning | P2-124–143 | Cleaned Ana's test data; gaps reach the teacher; numbers and symbols read correctly; free positioning of blocks (plan G); the lesson screen has no page scroll. | #53–#59 |
| 2026-10-30 21:20 | [Agent tooling](prompts-verbatim-2026-10-30-31.md#tooling) | P2-144–153 | Set up the ADHD output skill and subagents; how `/prd-waves` and the pipeline skills split work. No product code. | — |
| 2026-10-31 00:05 | [Teacher materials: PDF search](prompts-verbatim-2026-10-30-31.md#materials-search) | P2-154–155 | Explained retrieval over the teacher's PDFs and what FTS is. | — |
| 2026-10-31 00:30 | [Stitch prompt and plan check](prompts-verbatim-2026-10-30-31.md#stitch-prompt) | P2-156–162 | Wrote a Stitch prompt from the plans; checked the front-end plan against the backend; updated after backend changes. | docs |
| 2026-10-31 03:37 | [Claude storage cleanup](prompts-verbatim-2026-10-30-31.md#claude-storage) | P2-163 | Personal tooling. | — |
| 2026-10-31 04:32 | [Teacher page on the real API?](prompts-verbatim-2026-10-30-31.md#teacher-integration) | P2-164 | Question about `/professor` and how insights are generated. | — |
| 2026-10-31 04:59 | [Context document](prompts-verbatim-2026-10-30-31.md#context-doc) | P2-165–166 | A context document to add for the class. | — |
| 2026-10-31 05:10 | [PDF viewer and home tag](prompts-verbatim-2026-10-30-31.md#pdf-viewer) | P2-167–170 | The cited PDF renders without the passage-mapping concept; removed the "API conectada" tag; PR merged. | — |
| 2026-10-31 06:15 | [How PDFs work today](prompts-verbatim-2026-10-30-31.md#pdfs-today) | P2-171 | Question only. | — |
| 2026-10-31 11:17 | [Which AI draws; voice button](prompts-verbatim-2026-10-30-31.md#drawing-ai) | P2-172–178 | Explained the drawing pipeline; dropped Ciências; the voice button opens the subject notebooks. | #55 |
| 2026-10-31 12:08 | [Value review and citation chip](prompts-verbatim-2026-10-30-31.md#value-review) | P2-179–181 | Reviewed what delivers value; asked for a local session to test the citation chip. | — |
| 2026-10-31 12:30 | [Pull the PDF editing feature](prompts-verbatim-2026-10-30-31.md#pull-pdf-edit) | P2-182 | `git pull` only. | — |
| 2026-10-31 12:33 | [Gaps demo cleanup](prompts-verbatim-2026-10-30-31.md#gaps-demo) | P2-183–186 | Cleaned a test conversation and its gap analysis; the teacher side stays out of the live demo. | — |
| 2026-10-31 13:17 | [Demo boards and the home hero](prompts-verbatim-2026-10-30-31.md#demo-boards) | P2-187–201 | Three agents tested the tutor in Matemática, Biologia and História; found that Gemini image credits are depleted (HTTP 402); fixed the home hero; built scripted boards for four subjects and seeded them as real sessions (`scripts/seed-board-sessions.ts`); logged every Person 2 prompt in this folder; merged. | #61 |
