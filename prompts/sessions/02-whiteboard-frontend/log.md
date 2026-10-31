# Prompt log — Person 2 · Whiteboard front-end

> Add one row per entry. Entry files live in this folder (`YYYY-MM-DD-hhmm-<topic>.md`, from `_template.md`).

| Date (Brazil, UTC−3) | Title | Task id | Entry file | Commit |
|---|---|---|---|---|
| 2026-10-30 20:00 | Wave 1: protocol mirror + mock, design system | T0, T1 | [2026-10-30-2000-wave-1-protocol-and-design-system.md](2026-10-30-2000-wave-1-protocol-and-design-system.md) | PR #1 + T1 PR |
| 2026-10-30 21:00 | Wave 2: board core, start screen, orb | T2, T3, T8, T10 | [2026-10-30-2100-wave-2-board-core-start-orb.md](2026-10-30-2100-wave-2-board-core-start-orb.md) | PRs #3, #4 + T2/T3 PR |
| 2026-10-30 23:30 | Plan v2: Stitch student pages on the real API; track K (API + contracts) | K | [2026-10-30-2330-stitch-student-pages-plan.md](2026-10-30-2330-stitch-student-pages-plan.md) | feat/p2-api-contracts |

## Every prompt, verbatim (bulk export)

All 201 prompts Robério typed in the 25 local Claude Code sessions of this repository, plus one Mento conversation opened from another project folder (2026-10-30 → 2026-10-31) are in [`prompts-verbatim-2026-10-30-31.md`](prompts-verbatim-2026-10-30-31.md), in the original Portuguese. One row per conversation (and per phase of the long main session); the prompt numbers point into that file.

| Start (UTC) | Conversation / phase | Prompts | Outcome | PRs |
|---|---|---|---|---|
| 2026-10-30 20:43 | [Before the repo: Studdy research and clone](prompts-verbatim-2026-10-30-31.md#studdy) | P2-001–003 | Researched the Studdy AI competitor (later `docs/15-studdy-teardown.md`), then cloned the Mento repo. | — |
| 2026-10-30 21:10 | [Main session](prompts-verbatim-2026-10-30-31.md#main): study, architecture, Stitch, the wave plan | P2-004–021 | Studied the repo as Person 2, explained the package layout and the Next.js contract gaps, tried Google Stitch for screens, ran waves 1–2 (protocol mock, design system, board core, start screen, orb). | #1–#4, #6 |
| 2026-10-31 02:15 | Main session: Stitch student pages, plan v2 and reviews | P2-022–060 | Planned the seven Stitch student screens on the real API with two independent plan reviews; teacher UI fixes (one subject per teacher, no class notes); merged the Stitch chrome, home and session screen; bigger logo; exercise lists per intervention. | #10, #12–#17 |
| 2026-10-31 03:15 | Main session: real API, MongoDB, tutor audio, history | P2-061–086 | Ran against the real API and the `.env` MongoDB (no Docker); fixed tutor audio and voice sessions; lesson history drawer and reopen; spoken conversation with barge-in; circle annotations; subject card opens the history; a Matemática subject from a PDF. | #18–#27 |
| 2026-10-31 04:49 | Main session: session controls clean-up | P2-087–093 | Removed the pause button; opening the mic silences the tutor; removed the session simulated badge and the class notes card. | #29, #30, #32 |
| 2026-10-31 05:22 | Main session: plans A–C | P2-094–102 | Detailed, agent-reviewed plans for a handwriting board, exact diagrams and "every reply writes on the board"; spoken-text layer for TTS. | #36–#41 |
| 2026-10-31 05:58 | Main session: demo materials, real pause, teacher PDFs | P2-103–114 | Four original 8º-ano books as demo materials; real pause that resumes mid-word; teacher Materials tab without upload; better exercise-list PDFs. | #43–#47 |
| 2026-10-31 06:58 | Main session: fewer writes, formulas aloud, board editing | P2-115–123 | The tutor writes only when the lesson continues; formulas read aloud; the student and the tutor delete and rearrange board blocks. | #49–#52 |
| 2026-10-31 10:28 | Main session: teacher gaps, voice numbers, free positioning | P2-124–143 | Cleaned Ana's test data (PR #53 closed unmerged); gaps reach the teacher; numbers and symbols read correctly; free positioning of blocks (plan G); the lesson screen has no page scroll. | #53 (closed), #54, #56–#59 |
| 2026-10-30 21:20 | [Agent tooling](prompts-verbatim-2026-10-30-31.md#tooling) | P2-144–153 | Set up the ADHD output skill and subagents; how `/prd-waves` and the pipeline skills split work. No product code. | — |
| 2026-10-31 00:05 | [Teacher materials: PDF search](prompts-verbatim-2026-10-30-31.md#materials-search) | P2-154–155 | Explained retrieval over the teacher's PDFs and what FTS is. | — |
| 2026-10-31 00:30 | [Stitch prompt and plan check](prompts-verbatim-2026-10-30-31.md#stitch-prompt) | P2-156–162 | Wrote a Stitch prompt from the plans; checked the front-end plan against the backend; updated after backend changes; adopted the student start flow v2 (D47). | `9b680f7` (pushed to `main`, no PR) |
| 2026-10-31 03:37 | [Claude storage cleanup](prompts-verbatim-2026-10-30-31.md#claude-storage) | P2-163 | Personal tooling. | — |
| 2026-10-31 04:32 | [Teacher page on the real API?](prompts-verbatim-2026-10-30-31.md#teacher-integration) | P2-164 | Question about `/professor` and how insights are generated. | — |
| 2026-10-31 04:59 | [Context document](prompts-verbatim-2026-10-30-31.md#context-doc) | P2-165–166 | A context document to add for the class. | — |
| 2026-10-31 05:10 | [PDF viewer and home tag](prompts-verbatim-2026-10-30-31.md#pdf-viewer) | P2-167–170 | The cited PDF renders without the passage-mapping concept; removed the "API conectada" tag; per-concept mastery card without simulated badges. | #33 |
| 2026-10-31 06:15 | [How PDFs work today](prompts-verbatim-2026-10-30-31.md#pdfs-today) | P2-171 | Question only. | — |
| 2026-10-31 11:17 | [Which AI draws; voice button](prompts-verbatim-2026-10-30-31.md#drawing-ai) | P2-172–178 | Explained the drawing pipeline; dropped Ciências; the voice button opens the subject notebooks. | #55 |
| 2026-10-31 12:08 | [Value review and citation chip](prompts-verbatim-2026-10-30-31.md#value-review) | P2-179–181 | Reviewed what delivers value; asked for a local session to test the citation chip. | — |
| 2026-10-31 12:30 | [Pull the PDF editing feature](prompts-verbatim-2026-10-30-31.md#pull-pdf-edit) | P2-182 | `git pull` only. | — |
| 2026-10-31 12:33 | [Gaps demo cleanup](prompts-verbatim-2026-10-30-31.md#gaps-demo) | P2-183–186 | Cleaned a test conversation and its gap analysis; the teacher side stays out of the live demo. | — |
| 2026-10-31 13:17 | [Demo boards and the home hero](prompts-verbatim-2026-10-30-31.md#demo-boards) | P2-187–201 | Three agents tested the tutor in Matemática, Biologia and História; found that Gemini image credits are depleted (HTTP 402); fixed the home hero; built scripted boards for four subjects and seeded them as real sessions (`scripts/seed-board-sessions.ts`); logged every Person 2 prompt in this folder; merged. | #61 |

## Commit coverage (checked 2026-10-31 14:10 UTC)

Every commit Robério authored that is on `main` (112, `git log origin/main --no-merges --author=roberiof`) plus the one on the unmerged branch `feat/teacher-hide-mock-insights` was traced to the local Claude session that made it (the earliest transcript line that mentions its hash) and so to a conversation above. Result: **no commit without a logged prompt.** The prompt column is the prompt that asked for the change, or the latest one before its first commit; times are UTC.

| PR | Title | Conversation | Prompt | First commit | Commits |
|---|---|---|---|---|---|
| #1 | P2 T0: local turn protocol mirror, Rome fixtures and mock API client | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-015, P2-018 | `c14c9e5` 10-30 23:15 | 2 |
| #2 | P2 T1: design tokens, base components and /dev/ui gallery | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-015, P2-018 | `56ffe7f` 10-30 23:16 | 2 |
| #3 | P2 T8: start screen and end-of-conversation controls | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-015, P2-018 | `af2966e` 10-30 23:25 | 3 |
| #4 | P2 T10: voice orb with mascot faces and code-drawn ring | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-015, P2-018 | `d148964` 10-30 23:26 | 2 |
| #6 | P2 T2+T3: board core — columns, store, sanitizer and action queue | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-015, P2-018 | `9ea606e` 10-30 23:27 | 7 |
| no PR (pushed to `main`) | Adopt student start flow v2 (D47): subject cards, free session, voice opening | [stitch-prompt](prompts-verbatim-2026-10-30-31.md#stitch-prompt) | P2-159 | `9b680f7` 10-31 00:40 | 1 |
| #10 | Teacher UI: gaps, insights and intervention on mock data | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-028 | `ae49961` 10-31 02:36 | 5 |
| #12 | P2 K: real API client, @mento/contracts, history replay | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-033 | `cf29187` 10-31 02:49 | 3 |
| #13 | P2 L: Stitch design chrome (Nunito Sans, top bar, modal, drawer, menu, | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-032 | `40ac70d` 10-31 02:46 | 4 |
| #14 | P2 M: student home from Stitch, wired to subjects and sessions | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-038 | `af9c450` 10-31 02:57 | 1 |
| #15 | P2 N1: session screen from Stitch (loading, board, chat, click-and-ask | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-048 | `07f83fd` 10-31 03:02 | 3 |
| #16 | P2: larger top-bar logo (cropped wordmark) | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-053 | `3729ca3` 10-31 03:10 | 1 |
| #17 | Teacher UI: exercise lists per intervention (teacher and student PDFs) | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-053 | `4dd9e88` 10-31 03:10 | 1 |
| #18 | P2: fixes from the first run against the real API | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-062 | `4bd092f` 10-31 03:18 | 1 |
| #19 | P2: tutor audio — voice sessions from subject cards, turns follow sess | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-065 | `fd02ec5` 10-31 03:24 | 1 |
| #20 | P2: whiteboard as a pannable canvas (drag, inertia, zoom, follow camer | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-070 | `b5bbd1c` 10-31 03:37 | 1 |
| #21 | P2: Histórico de Aulas drawer (Stitch) with reopen | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-070 | `24133ad` 10-31 03:38 | 1 |
| #22 | P2: session ⋮ menu and paused/ended modal (Stitch); drop Material Didá | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-070 | `f247330` 10-31 03:39 | 1 |
| #23 | P2: spoken conversation with the tutor; mute fix; reopened lessons sta | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-075 | `ebcb91e` 10-31 03:55 | 2 |
| #24 | P2: smoother voice — prefetch tutor audio | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-079 | `f733a56` 10-31 04:10 | 1 |
| #25 | P2: draw circle_annotate on the board (hand-drawn loop around the matc | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-080 | `aeb695d` 10-31 04:14 | 1 |
| #26 | P2: subject card opens the lesson history (continue or start new) | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-083 | `c484032` 10-31 04:20 | 1 |
| #27 | P2: simpler lesson history (no status filters) | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-084 | `c6e6378` 10-31 04:27 | 1 |
| #29 | P2: remove the pause button from the session controls | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-087 | `e526c69` 10-31 04:50 | 1 |
| #30 | P2: tutor goes quiet when the mic opens; cleaner session controls | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-088–089 | `4864254` 10-31 04:53 | 2 |
| #32 | Teacher: remove the class notes card ("notas de observação do docente" | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-091 (and P2-035) | `c899f71` 10-31 04:58 | 1 |
| #33 | feat(web): per-concept mastery card, no simulated badges, no API statu | [pdf-viewer](prompts-verbatim-2026-10-30-31.md#pdf-viewer) | P2-167–169 | `d2d3185` 10-31 05:19 | 1 |
| #36 | Tutor: every reply writes or points on the board (prompt + held-questi | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-097 | `0a34576` 10-31 05:35 | 2 |
| #38 | Fix: resume an ended lesson before sending a turn | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-099 | `e968743` 10-31 05:44 | 1 |
| #39 | P2: the board is written live by a pen (handwriting, pen-drawn circles | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-097 | `20da925` 10-31 05:40 | 3 |
| #40 | Voice: tutor says "antes de Cristo" and "x ao quadrado" (spoken-text l | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-100 | `9d1cea2` 10-31 05:52 | 1 |
| #41 | Diagrams: the tutor draws exact figures (forces, graphs) with draw_dia | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-097 | `204bdc7` 10-31 05:42 | 13 |
| #43 | P2: real pause — the tutor stops mid-word and resumes from the same po | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-107 | `e1c3b65` 10-31 06:20 | 1 |
| #44 | Tutor: fewer questions and pictures proportional to the text | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-111 | `ba391c7` 10-31 06:35 | 1 |
| #45 | Demo materials: four original 8º-ano books (História do Brasil, Matemá | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-106 | `0873a5b` 10-31 06:17 | 6 |
| #46 | Teacher: Materials tab shows the História do Brasil book, no upload | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-113 | `98565cb` 10-31 06:42 | 1 |
| #47 | Teacher: better exercise-list PDFs (student copy and answer key) | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-113 | `b4f40f1` 10-31 06:42 | 1 |
| #49 | Voice: tutor reads formulas aloud (x + y = 10, F = m·a, f(x) = x², 10  | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-118 | `c7cc7cd` 10-31 07:06 | 1 |
| #50 | Tutor: write on the board only when the reply continues the lesson | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-117 | `94132f4` 10-31 07:03 | 3 |
| #51 | Teacher: show and analyse only History (D78) | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-120 | `08d619f` 10-31 07:14 | 1 |
| #52 | Board editing: the student (and the tutor) delete and rearrange blocks | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-120 | `237c402` 10-31 07:09 | 9 |
| #53 (closed, not merged) | fix(analysis): hide the lab's mock insights from the teacher | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-124 | `79f56ed` 10-31 10:30 | 1 |
| #54 | fix(web): end the lesson when the student leaves the board | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-133 | `aca6bd2` 10-31 11:15 | 2 |
| #55 | Voice Button Opens the Subject Notebooks | [drawing-ai](prompts-verbatim-2026-10-30-31.md#drawing-ai) | P2-176 | `cdbf049` 10-31 11:25 | 2 |
| #56 | Voice: read numbers, °C, √, π, fractions, Δ, formulas and D. Pedro II  | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-136 | `841250c` 10-31 11:37 | 2 |
| #57 | fix(tutor): gaps reach the teacher (judge no longer drops evidence; tu | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-137 | `f7ccd31` 10-31 11:41 | 3 |
| #58 | Free positioning: drag a block anywhere; the tutor places blocks side  | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-140 | `1814d8c` 10-31 12:04 | 1 |
| #59 | Lesson screen fills the viewport: no page scroll, no white strip | [main](prompts-verbatim-2026-10-30-31.md#main) | P2-142 | `3bfbeef` 10-31 12:10 | 1 |
| #61 | Home hero: stop the last-session label from breaking the layout; scrip | [demo-boards](prompts-verbatim-2026-10-30-31.md#demo-boards) | P2-192 | `451067a` 10-31 13:31 | 7 |
