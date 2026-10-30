# 05 — Learner model and analysis

> Status: design agreed (lean version for the hackathon). Last updated: 2026-10-30.

## Goal

Turn what happens in a tutoring session into an **evidence-based picture of how a student thinks and learns**, shown to the teacher. It must be honest about uncertainty.

## Concepts

- **Evidence:** a structured record created when the student answers a verification question or shows reasoning (`concept`, `correct`, `independent`, `chunk_id`, timestamp).
- **Analysis:** a post-session job that reads the session log and produces structured observations.
- **Student picture:** the aggregate of analyses across sessions for one student.

## Two layers of analysis

1. **Deterministic counters** from the log: hints used, correct on first attempt, answered without help, per concept. Cheap and reliable.
2. **One LLM call with structured output** over the session log, returning (illustrative shape):

```json
{
  "misconceptions": [
    {"concept": "...", "hypothesis": "...", "confidence": 0.6,
     "evidence": [{"event_id": "...", "quote": "..."}]}
  ],
  "strategy_observations": [
    {"strategy": "visual_timeline", "outcome": "worked", "event_id": "..."}
  ],
  "suggested_action": "..."
}
```

The per-student aggregate sums observations across sessions. Each strategy shows how many times it worked out of how many tries (e.g., "timeline: 3 of 4"). With low `n` the label is "early evidence", never a verdict.

## Metrics

- **Mastery per concept with confidence**, from evidence (simple counters; no Bayesian Knowledge Tracing needed for the hackathon, though BKT is a good later upgrade).
- **Success rate per tutoring strategy**, with `n`.
- "Insufficient evidence" is a different state from "does not master".

> Background (research, from memory, **[Unverified]**): Bayesian Knowledge Tracing (BKT), knowledge-space/prerequisite graphs (ALEKS), misconception catalogs, and Open Learner Models (OLM) are the standard techniques. Deep Knowledge Tracing is out (opaque, needs data).

## What the teacher sees (see `06-teacher-interface.md`)

Per student: concepts, possible misconceptions with evidence, what seems to work (with `n`), suggested next action. The teacher can dismiss or correct.

## Student-facing view (nice-to-have 12)

"My progress": concepts to review and what usually helps, in friendly language (open learner model). Reuses the same data.

## What to avoid (hard rules)

- **No "learning styles"** (visual, auditory, etc.): not supported by research. We record *what worked on a task*, not what kind of person the student is.
- **No psychological or sensitive inferences** (anxiety, attention, personality). Educational evidence only. Students may be minors.
- **No conclusion from a single occurrence.** Every hypothesis shows evidence, confidence and a way for the teacher to contest it.
- **No numeric "score" presented as scientific.** If a visual score exists, explain its origin and uncertainty.
- No rankings of students.

## Data for the demo

In 24h we will have at most one or two real sessions.

- **1 real student:** the live demo session, with analysis generated on the spot (button "Analyze session" or automatic at the end).
- **2 to 3 simulated students:** pre-generated sessions with a visible **"simulated data"** badge.

## ZDR

The analysis call runs against a provider with a zero-data-retention option; the student is sent pseudonymized (ID, not name). Memory is structured data in Mento's database. See `08-privacy-zdr-security.md`.

## Verification flow (how evidence is produced)

1. The tutor calls `ask_verification` (a **new** question, not a repeat); the board shows it and the tutor waits.
2. The student answers by chat or voice.
3. A **judge call** (small LLM call with the lesson excerpts and a rubric) returns `correct` / `partial` and whether the answer was `independent` (no hint used), with a short `rationale`.
4. The server writes the `evidence` row and emits `evidence_recorded`.
5. The teacher card shows the `rationale` and the student's own words as **examples of reasoning** (the Flint-style insight).

A diagnostic opener ("how much do you remember, 1–10?") may give a first data point per concept; it is never shown as a score. Details: `16-technical-roadmap.md` §8.
