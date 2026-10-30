# 01 — Hackathon scope

> Status: **agreed in brainstorming** (pending founder's final answer on item 12, see `10-decisions.md`). Last updated: 2026-10-30.
> **This is the source of truth for what we build.** If an item is not in Must or Should, do not build it without approval.

## Context

- 2-day hackathon backed by **Teachy**. ~**24h of build time**, then code freeze.
- 3 people, in parallel.
- **Demo: History, Ancient Rome** (content in Portuguese). One subject, one lesson, 2 to 3 PDFs. No math in the demo.
- Low budget and lots of testing: prefer cheap and simple.

## Must-have (without these the demo does not exist)

1. **AI whiteboard that writes and draws live:** text, labels, arrows, highlights, timeline and illustrations (e.g., the Colosseum), revealed step by step.
2. **Two-way conversation, in text**, with **click-and-ask**: the student selects a board object and asks about it.
3. **Three-layer prompt** (base + subject profile + lesson context) with the **History profile**.
4. **Script-based ingestion** of 1 subject and 1 lesson (2 to 3 PDFs), with **retrieval filtered by subject and lesson**, citation (`source`, `page`, `quote`) and a warning when an answer is **outside the material**.
5. **Sources visible to the student:** a "Lesson material" panel and chips on each tutor message (`Slides, p.12`) that open the PDF at the cited excerpt.
6. **Recorded evidence:** verification questions with correct/incorrect, concept and source.
7. **Event log** of board and conversation persisted in the database.

## Should-have (in priority order; starts only when Must is stable)

8. **Teacher screen, single read-only page:**
   - Materials per subject and lesson.
   - Per-student card: concepts (with confidence), possible misconceptions (with evidence), what seems to work (with `n`), suggested next action.
   - 1 real student (from the demo) + 2 to 3 simulated ones with a **"simulated data"** badge.
9. **Post-session analysis** (deterministic counters + an LLM call with structured output) feeding item 8.
10. **Voice** (cascade STT → LLM → TTS over the same tutor core) with a voice/text toggle. Text remains the guaranteed baseline.

## Nice-to-have

11. **Math** subject profile (sketch, to show the platform scales).
12. **"My progress"** on the student side (concepts to review and what usually helps them; *open learner model*). *Still awaiting founder confirmation (option A or B, see `10-decisions.md`).*
13. PDF upload through the teacher interface.
14. Replay of the board moment where the error occurred.
15. "Resume session" button (cheap if the log is in the database).
16. Pre-ingested book library per subject.
17. **Classroom transcription for teachers** (Wispr Flow-style): a phone listens to the class and speech becomes a searchable source and evidence input. Fits the schema as `Source.type = transcript`.
18. Exam and question generation.

## Out of scope

Real authentication, multiple classes, grades and gradebook, full lesson configuration, family portal, Teachy integration, other subjects, 3D or multi-user collaborative whiteboard, custom-trained models, complex multi-agent systems, LMS.

## Schedule (adjust to the real code-freeze time)

| Hours | Milestone |
|---|---|
| 0–4 | Skeleton: board on screen, chat, database with schema, 1 PDF ingested |
| 4–12 | **Main loop:** tutor writes and draws, conversation, click-and-ask |
| 12–18 | Sources and highlight, evidence, persisted log, stable end-to-end session |
| **18** | **Cut line.** If Must does not run end to end, Should does not start |
| 18–22 | Teacher screen (first). Voice only if the teacher screen is already done |
| 22–24 | Demo rehearsal, drawing cache, bug fixing |

## Demo script (3 to 4 min) = definition of done

1. Student opens "Ancient Rome" and sees the lesson material listed.
2. Asks: "how did Rome go from Republic to Empire?".
3. Tutor draws the timeline and the Colosseum while explaining, with source chips.
4. Student clicks a date and asks "why that date?".
5. Tutor answers; when citing the slide, the PDF opens at the highlighted excerpt.
6. Tutor asks a verification question; the student gets it wrong; the tutor changes the explanation; the result is recorded.
7. Teacher screen shows materials and what the AI identified about the student.

### Demo success criteria

- The AI does not just answer: it teaches in steps.
- The board is interactive and does not look like a static image.
- The explanation matches the teacher's source and cites the page.
- The student's question changes the course of the lesson.
- The verification is about something actually different from what was explained.
- Evidence is recorded and shown to the teacher.
- Everything works live end to end, no pre-recorded video.

## Known risks

- **LLM drawing quality** → pre-generate and cache 4 to 6 reviewed Rome images (Colosseum, aqueduct, legionary, map); use deterministic components for timelines; generate live only as a stretch.
- **Voice latency** → hence text first, voice later.
- **Scanned PDFs** → break highlighting; test the PDFs early.
- **Image/TTS/LLM choices** → day-0 bake-offs (see `16-technical-roadmap.md` §12); the board is plain DOM, so no whiteboard-library license risk.
- **Hackathon IP** → read the rules before submitting code.
