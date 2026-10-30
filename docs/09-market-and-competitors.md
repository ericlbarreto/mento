# 09 — Market and competitors

> Status: **condensed from the brief and brainstorming research; mostly [Unverified].** Funding, user counts and features of third parties are volatile and often self-reported. **Re-verify every item before using it in a pitch, site or proposal.** Last updated: 2026-10-30.

## Teachy (hackathon sponsor)

- Educational AI company in Brazil serving teachers and schools; earlier research found planning, material creation, assessments, learning recovery, an AI tutor and student/class tracking. Scope changes; audit directly in the product and with the Teachy team.
- Role: **potential partner, strategic customer, reference, adjacent competitor.**
- Do **not** present Mento as "yet another platform that generates PDFs, exercises, summaries or a chatbot". Do **not** claim Teachy lacks a feature without evidence.
- Hypothesis: Mento as a **live-tutoring and learning-intelligence layer** that complements Teachy: live visual tutoring, persistent learner model, independent verification, aggregate difficulty patterns, intervention recommendation.
- Questions to ask Teachy: how they imagine individual tutoring; what learning signals they observe; how individual difficulties reach the teacher; whiteboard/voice roadmap; feasible integration; pedagogical metrics; what a school pilot would need.
- Do not open by saying we want to sell the idea. Present a product opportunity with a working prototype. There is no indication Teachy has offered or shown interest in acquiring Mento.
- **Hackathon IP:** read the rules (who owns IP, sponsor license, exclusivity, code publication, third-party components).

## Reference competitors (verify before citing)

| Category | Names | Where they compete | Space Mento wants |
|---|---|---|---|
| School AI | Teachy, Flint, Lyceum | Teachers, materials, school and student | Live visual tutoring + learner model + evidence for teachers |
| Personal tutor | Studdy, Khanmigo, Gauth | Explanation and dialogue | Persistent curriculum context + evidence tied to school |
| Whiteboard tutor | Gauth, Accelute | Visual, interactive explanation | Board as structured pedagogical state tied to diagnosis |
| Materials → study | StudyFetch, Sizzle, Quizlet | PDFs, flashcards, quizzes | Institutional ingestion + teacher-defined curriculum |
| Gamified learning | Gizmo, Duolingo | Habit, practice | Learning with teacher and school in the loop |
| General assistants | ChatGPT, Claude, Gemini | Answers for anything | Context, continuity, curriculum, verification |

- **Gauth:** launched an "Unlimited Digital Canvas" on 2026-10-01 (continuous whiteboard, restores position/zoom, export to PDF/link). Per its release, element-level Q&A, animation and 3D were *planned*. How it is implemented is not public. Sources: see `11-technology-research.md`.
- Lesson: a whiteboard, PDF upload, voice and chat are **not** a moat on their own; the differentiator is the full loop.

## Do-not-assume list (audit with real accounts)

Does it offer a real whiteboard or just images? Can the student edit the same canvas? Does the AI respond to a contextual object selection? Does it sync voice and progressive writing? Does it keep board state between sessions? Does it use school curriculum and materials? Does it keep a per-concept learner model? Does it separate assistance from independent performance? Does it identify misconceptions with evidence? Does it aggregate errors for the class? Does it generate an intervention and measure the result?

## Market notes

- Funding/user numbers mentioned in earlier research (StudyFetch, Gizmo, Ello, Flint, Sizzle/Campus.edu, Khan) are **not verified** here; see the brief, sections 13 and 14, for context and for how to interpret such numbers (cumulative users ≠ active users ≠ paying customers; funding ≠ revenue).
- **YC "The Primer"** (Fall 2026 RFS, per earlier research): a personal AI tutor for children. Related but not identical to Mento; confirm the current RFS before any application.
- Recife market figures (Censo Escolar) in the brief must be rechecked against Inep data.

## Go-to-market (hypothesis, outside the hackathon)

Private schools in Recife first (one school, one subject, one class, 6–8 weeks pilot with before/after assessment), then public networks (different dynamics: procurement, devices, connectivity). See the brief, sections 10 and 11.

## Update from the Studdy and Flint review (2026-10-30)

- **Flint** (public visuals, not the app): has a whiteboard, speech in/out, numbered citations, live session monitoring, class-level insights with examples of student reasoning, and a "create follow-up activity" action. **It overlaps more than expected** with Mento's student + teacher story.
- **Studdy** (explored live): voice-first whiteboard tutor built as a script of tool calls (`15-studdy-teardown.md`); no teacher side seen.
- **Where Mento must differentiate** (to be verified against the live products): the **tutor drawing live with click-and-ask on any board object**, **citations tied to the teacher's own PDFs with the excerpt highlighted**, and the **per-student picture built from recorded evidence**. Do not claim these are absent from competitors without testing their live apps.
