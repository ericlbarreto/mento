# 06 — Teacher interface

> Status: Should-have (item 8). The backend models the data now; the UI only displays it. Last updated: 2026-10-30.
> Layout, patterns borrowed from Flint and shared components: see `18-ui-references.md` §4; brand and logo: `19-brand-assets.md`.

## Principle

For the hackathon the teacher **does not configure anything through the UI**. Materials enter via folder + ingestion script. The teacher screen is **one read-only page** that is built only after the Must is stable. If time runs short, it becomes a slide fed by database data, and the live demo remains the student's.

## Layout

**Block 1 — Materials per subject**
Subject → lesson → list of PDFs, each linking to the file. Reads straight from the database.

**Block 2 — What the AI identified per student**
Student list on the left; on the right a card for the selected student:

| Section | Content | Source |
|---|---|---|
| **Concepts** | Map colored by mastery, with confidence | Recorded evidence |
| **Possible misconceptions** | Hypothesis + quote from the student's message/answer + link to the session moment | Conversation analysis |
| **What seems to work** | Strategies that helped, with `n` | Conversation analysis |
| **Suggested next action** | One recommendation the teacher can accept or dismiss | Synthesis of the above |

Each section shows "based on N sessions" and an uncertainty label.

## Data

- 1 real student (the live session) + 2 to 3 simulated students with a visible **"simulated data"** badge. Never present simulated data as real evidence.

## Endpoints (read-only)

- `GET /subjects` — subjects, lessons and sources.
- `GET /students` — students.
- `GET /students/:id/analysis` — latest analysis plus evidence.

## Out of scope for the teacher UI

Upload, editing sources, class management, grades, lesson configuration, approving interventions with real effect. (A button "approve micro-lesson" may exist only as a registered click.) Whole-class intervention loop from the brief (section 8) is future work; for the demo, show a simulated class pattern clearly badged.

## Principles

- Show context, evidence and uncertainty; no rankings, no permanent labels.
- The teacher can ignore or contest any recommendation.
- Do not infer difficulty from non-use.
