# 01 — Hackathon scope

> Status: **updated 2026-10-30 for the simplified product model** (single teacher workspace, Students and Materials entities, class context). Tiers below are a **proposal** to be confirmed by the founder (see `10-decisions.md`, D29–D35 and Q12–Q16).
> **This is the source of truth for what we build.** If an item is not in Must or Should, do not build it without approval.

## Context

- 2-day hackathon backed by **Teachy**. ~**24h of build time**, then code freeze.
- 3 people, in parallel (`17-work-split.md`).
- **Demo: History, Ancient Rome** (content in Portuguese), taught from a **book/PDF uploaded by the teacher**, to a class described as **8º ano (Ensino Fundamental II)**. No math in the demo.
- **Segment focus for the MVP:** Ensino Fundamental II (7º, 8º and 9º ano). Ensino Médio and college are future.
- Low budget and lots of testing: prefer cheap and simple.

## Product model in one page

- **One teacher, one workspace.** No authentication and no multi-teacher support (quick win). Every teacher tab shows the same data because state lives on the server.
- **Two teacher entities, two tabs:** **Students** and **Materials**. Students can be created in the UI or directly in the database; materials are PDFs (e.g., a book) uploaded in the UI.
- **Class context:** one global description of the class (grade level and characteristics) written by the teacher. It is applied to **every** student chat.
- **The whiteboard generates the data:** every conversation is stored (events, evidence) and analyzed into **insights** (gaps, progress, suggestions).
- **The Students tab** shows overview metrics (students, conversations, gaps, insights) and, per student, how they are evolving, their gaps and proactive suggestions.
- Details: `00-product-vision.md`, `06-teacher-interface.md`, `07-architecture-and-data.md`.

## Must-have (without these the demo does not exist)

1. **AI whiteboard that writes and draws live:** text, labels, arrows, highlights, timeline and illustrations (e.g., the Colosseum), revealed step by step.
2. **Two-way conversation, in text**, with **click-and-ask**: the student selects a board object and asks about it.
3. **Layered prompt:** base + **subject profile** (from the material's subject) + **course context** = **class context** (grade level and characteristics) + excerpts from the materials of the chosen subject + the student's learner summary + topic. Language register adapted to Ensino Fundamental II (7º–9º ano).
4. **Material ingestion** (PDF/book → pages, chunks, search index, outline) **by script at minimum**, with **retrieval scoped to the material the student chose**, citation (`material`, `page`, `quote`) and a warning when an answer is **outside the material**.
5. **Sources visible to the student:** chips on each tutor message (`Livro, p.12`) that open the PDF at the cited excerpt.
6. **Recorded evidence:** verification questions judged as correct/incorrect with concept, source and rationale.
7. **Persisted conversations:** every session and its event log stored **per student** (the data foundation for insights).
8. **Students and class context exist:** created by seed/database at minimum (UI forms are Should); the student start screen (D47) has a **pre-set demo student**, **one card per subject with its count of materials**, and a **Mento button for a free session with no material**; the session opens with the tutor asking (by voice) what to study.

## Should-have (in priority order; starts only when Must is stable)

9. **Teacher interface, two tabs (single-teacher workspace)**, in this build order:
   - **9a. Students tab:** overview metrics (students, conversations, gaps identified, insights generated), student list, **student detail** (evolution, gaps with evidence, suggestions), **create student** form. Simulated students carry a **"simulated data"** badge.
   - **9b. Class context card** (grade level + description; one global setting) editable in the UI. Until then it is seeded.
   - **9c. Materials tab:** upload a PDF, processing status, list of materials. Until then ingestion is by script.
10. **Post-session analysis → insights:** automatic after each conversation (counters + a structured LLM call), producing **gap / progress / suggestion** insights that feed the teacher view **and** the learner summary used in the student's next conversation.
11. **Voice** (cascade STT → LLM → TTS over the same tutor core) with a voice/text toggle. Text remains the guaranteed baseline.

## Nice-to-have

12. **Math** subject profile (sketch, to show the platform scales).
13. **"My progress"** on the student side (concepts to review; *open learner model*). *Still awaiting founder confirmation (see `10-decisions.md`, Q3).*
14. Read-only **replay of a conversation** (board moment where a gap appeared) for the teacher.
15. "Resume session" button (cheap because the event log is in the database).
16. Delete/rename materials; re-process a material; progress per page.
17. **Classroom transcription for teachers** (Wispr Flow-style) as a new material type (`transcript`).
18. Exam and question generation.

## Out of scope

Authentication and multi-teacher support, multiple classes (turmas) and per-class settings, other grade levels (Ensino Médio, college), grades/gradebook, family portal, Teachy integration, other subjects beyond History in the demo, complex multi-agent systems, custom-trained models, LMS.

## Schedule (adjust to the real code-freeze time)

| Hours | Milestone |
|---|---|
| 0–4 | Skeleton: board on screen, chat, database with schema, seed (students, class context), 1 book PDF ingested by script |
| 4–12 | **Main loop:** tutor writes and draws, conversation, click-and-ask, conversations persisted |
| 12–18 | Citations and PDF highlight, evidence, stable end-to-end session; **Must complete** |
| **18** | **Cut line.** If Must does not run end to end, Should does not start |
| 18–22 | Teacher **Students tab** first (metrics, student detail, insights), then analysis → insights; Materials upload and class-context form only if time allows; voice last |
| 22–24 | Demo rehearsal, drawing cache, bug fixing |

### Cut order if time runs short (first to cut → last)

1. Voice (the session then opens in text: the tutor's greeting appears in the chat and the student types the topic). 2. Materials upload UI (use the ingestion script). 3. Class context form (use the seeded value). 4. Create-student form (use seed/DB). 5. Evolution chart in the student detail (keep the list of gaps and suggestions). **Never cut:** persisted conversations, evidence, the analysis → insights path and the student detail with gaps.

## Demo script (3 to 4 min) = definition of done

0. *Setup (pre-done, shown briefly):* the teacher's **Materials** tab has the history book; the **class context** says "8º ano"; students exist.
1. The demo student is already set; they click the **História** card ("1 material"); the tutor greets them by voice and asks what to study; the student says "República e Império".
2. Tutor starts writing within ~3 s, in a register suited to an 8º ano class.
3. Tutor draws the timeline and the Colosseum while explaining, with source chips.
4. Student clicks a date and asks "why that date?"; the tutor answers about that element.
5. Student clicks a chip; the PDF opens at the highlighted excerpt.
6. Tutor asks a verification question; the student answers wrong; the tutor changes the explanation; evidence is recorded.
7. **Teacher Students tab:** metrics (students, conversations, gaps, insights); open the student: **evolution, the gap found in this conversation with the student's own words, and a suggested next step**; other students are badged "simulated data".

### Demo success criteria

- The AI does not just answer: it teaches in steps.
- The board is interactive and does not look like a static image.
- The explanation matches the teacher's material and cites the page.
- The student's question changes the course of the conversation.
- The verification is about something actually different from what was explained.
- A conversation turns into a **gap and a suggestion** visible to the teacher, without the teacher doing anything.
- Everything works live end to end, no pre-recorded video.

## Known risks

- **Scope grew with the new teacher interface** (students, class context, uploads, insights). Mitigation: the cut order above; Must is unchanged in size except the data foundation (items 7–8).
- **Books are large:** ingestion time/cost and retrieval quality (pages cannot all fit in context). Mitigation: text-layer extraction first, search index (FTS), outline by chapters, page cap for the demo, pre-ingested book (`04-knowledge-and-sources.md`).
- **LLM drawing quality** → pre-generate and cache 4 to 6 reviewed Rome images; deterministic timelines; live generation as a stretch.
- **Voice latency** → text first, voice later.
- **Scanned PDFs** → break text extraction and highlighting; test the book early.
- **Single teacher without auth** → prototype shortcut only; fictional data only (`08`).
- **Hackathon IP** → read the rules before submitting code.
