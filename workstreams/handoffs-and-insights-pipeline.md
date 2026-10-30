# Handoffs between the 3 people, and the insights pipeline

> Status: proposed; schemas are **sketches** to be frozen at kickoff in `packages/contracts`. Last updated: 2026-10-30.
> Read with `docs/16-technical-roadmap.md` (turn protocol), `docs/05-learner-model-and-analysis.md` and `docs/07-architecture-and-data.md`.

## 1. The five handoffs

```
   Person 2 (front)                Person 3 (back)                 Person 1 (teacher + data)
 ┌─────────────────┐   H1 SSE    ┌─────────────────┐   H2 events   ┌──────────────────────────┐
 │ Board, queue,   │◄───────────►│ Turn handler,   │──────────────►│ Repository/DB            │
 │ orb, chat,      │  actions    │ LLM, drawing,   │  evidence     │ Analysis → insights      │
 │ sources, start  │             │ judge           │  session_ended│ Teacher UI (Students,    │
 │ screen          │   H4 voice  │ STT token, TTS  │◄──────────────│ Materials, class context)│
 │                 │◄───────────►│ proxy           │  H3 search,   │ Materials ingestion      │
 └────────┬────────┘             └─────────────────┘  summary,     └──────────┬───────────────┘
          │                                           class context            │
          └──────────────── H5 design system / components / read-only board ───┘
```

| Handoff | From → To | What crosses | Contract file | Mock until real |
|---|---|---|---|---|
| **H1** | P3 ⇄ P2 | The turn script over SSE (actions), the user events (`user_message`, `board_select`, `answer_submit`, `interrupted`) | `actions.ts`, `stream.ts`, `events.ts` | P2 uses `fixtures/*.json` through `/api/dev/fixture-turn` |
| **H2** | P3 → P1 | Every event and evidence row, session lifecycle (`session_started`, `session_ended`) | `repository.ts`, `events.ts` | P3 uses the in-memory repository |
| **H3** | P1 → P3 | Class context, material search/pages/outline, citation validation, learner summary | `repository.ts` (read side), `sources.ts` | P3 uses fixture materials and a fake summary |
| **H4** | P3 ⇄ P2 | STT token, TTS audio + word timings, `SpeechPlayer`, `useStt()`, audio-level value for the orb | `speech.ts` | P2 uses the text-only `SpeechPlayer` (captions) |
| **H5** | P2 ⇄ P1 | Design tokens and components (`packages/ui`), read-only board replay (nice) | `packages/ui` exports | P1 builds with plain tokens first |

## 2. Contracts (canonical definitions live in `contracts-spec.md`)

Every shape that crosses between two people is defined **once** in [`contracts-spec.md`](contracts-spec.md) (and mirrored in `packages/contracts`). This file only tells you who produces and who consumes it.

| Contract | Defined in | Produced by | Consumed by |
|---|---|---|---|
| Actions (tools) and the SSE stream | `docs/16` §3–4 and spec §3 (`tutor_action`) | Person 3 | Person 2 |
| Events (the only list) | spec §3 | Person 3 and the Repository | Person 1 |
| Evidence and the judge result | spec §5–6 | Person 3 | Person 1 |
| Concept labels and `concept_key` | spec §7 | Person 3 and Person 1 (both follow the rules) | both |
| Insights, learner summary, analysis input/output | spec §8 | Person 1 | Person 1 (UI), Person 3 (learner summary) |
| `Repository` | spec §9 | Person 1 implements | Person 3 uses |
| `SpeechPlayer` | below | Person 3 implements; Person 2 owns the queue and the text-only default | Person 2 |
| Session lifecycle (`EventBus`, `JobQueue`) | `docs/21` §6 | Person 3 publishes `session_ended` | Person 1 subscribes |

```ts
// speech.ts — Person 3 implements the real player; Person 2 owns the queue and the text-only default
interface SpeechPlayer {
  speak(text: string, opts?: { style?: string; voice?: string }): Promise<void>;  // resolves when finished
  stop(): void;
  onWord?(cb: (w: { word: string; start_ms: number; end_ms: number }) => void): void;
  level?(): number; // 0..1 output amplitude for the orb
}
```

Session lifecycle: Person 3's `endSession` appends `session_ended` and publishes it on the in-memory `EventBus`; Person 1's analysis subscribes (`docs/21` §6).

## 3. Events that matter for insights (stored by Person 3, read by Person 1)

The full list with payloads is **`contracts-spec.md` §3**. The ones the analysis uses: `session_started`, `user_message` (the student's own words, incl. voice transcripts), `tutor_action` (what was taught and which pages), `verification_asked`, `verification_answered`, `hint_given`, `evidence_recorded` (with `result`, `independent`, `hints_used`, `rationale`, `concept_key`), `session_ended` (the trigger). `turn_timing` and `mic_state` are for monitoring only.

**Not stored:** raw audio (see `03-whiteboard-backend.md` §4). Voice turns store the **final transcript text**.

## 4. The insights pipeline (conversation → insight → teacher screen)

### 4.1 Sequence

```
1. Student talks / clicks / answers on the board                       (Person 2)
2. Turn handler runs the tutor; every action is stored as an event;    (Person 3)
   ask_verification → student answer → judge → evidence row
3. Student leaves / idles / closes the tab                             (Person 2 → Person 3)
   → client calls POST /api/sessions/:id/end (or sendBeacon) → Person 3 calls
     repository.endSession(...) which appends `session_ended`
4. repository triggers SessionEndedHandler(sessionId)                  (Person 1)
5. Analysis job: load events + evidence → counters → LLM structured    (Person 1)
   output → write `analyses` row → upsert `insights` rows
6. Teacher UI refreshes via the SSE live feed (`/api/stream/teacher`,     (Person 1)
   5 s polling fallback): metrics, list, student
   detail show the new gap/progress/suggestion with the student's own words
7. Next conversation of that student: getLearnerSummary(studentId)     (Person 1 → 3)
   feeds the open gaps into the tutor's prompt
```

### 4.2 Trigger and robustness

- **Trigger:** `session_ended` (reasons: `user_left` button, `idle_timeout` after 5 min without events, `beacon` on tab close, `manual`). Analysis runs **in-process, asynchronously** (no queue), target ≤ 60 s.
- **Idempotent:** keyed by `session_id`; re-running replaces that session's `analyses` row and re-upserts insights without duplicates.
- **Failure:** write `analyses.result = {"error": "..."}`; one automatic retry after 30 s; dev endpoint `POST /api/dev/analyze/:sessionId` re-runs it.
- **Short or empty sessions** (< 2 user messages or no evidence): create no gaps; may still count as a conversation.

### 4.3 Analysis input and output (shapes in `contracts-spec.md` §8)

- **Input (assembled by Person 1):** `student_id` (no name), `class_context`, `material`, `counters` (`user_messages`, `hints_given`, `verifications`, `correct`, `independent_correct`), the session's `evidence` rows (with `concept_key`, `result`, `independent`, `hints_used`), the `turns` (built from events), and the student's `open_gaps` so the model can **match instead of duplicating**.
- **Output (structured, Zod-validated):** `gaps` (each with `matches_gap_id?`, `concept`, `description`, `confidence`, `evidence: [{event_id, quote}]`), `progress`, `suggestions`.

### 4.4 Matching concepts across sessions

Gaps match first by **`concept_key`** (shared `normalizeConcept`), then by the model's `matches_gap_id`. Person 3 keeps labels stable by reusing the student's open-gap labels and the material's chapter titles (spec §7).

### 4.5 Rules when writing `insights`

- **Gap upsert:** if `matches_gap_id` is set (or the normalized concept — lowercase, no accents — matches an open gap), **update** it: raise/lower `confidence`, **append** evidence, set `updated_at`; otherwise **insert** `kind=gap`, `status=new`.
- **Confidence clamp:** with fewer than 2 evidence items for a concept, cap confidence at 0.5; never present a single occurrence as a conclusion.
- **Quotes must be real:** each `evidence.quote` must occur in the cited event text; otherwise drop that evidence item.
- **Resolution:** when a later session shows ≥ 2 independent correct answers on a concept with an open gap, add a `progress` insight and set the gap `status=resolved`.
- **Suggestions** are one per gap at most, not repeated while the previous one is `new`/`accepted`.
- **Teacher actions:** `PATCH /api/insights/:id` sets `accepted` or `dismissed`; dismissed items are excluded from metrics' "open" counts and from the learner summary.
- **Never** write traits, personality or emotional inferences; only concepts and evidence (`docs/05`, `docs/08`).

### 4.6 What the teacher UI reads

| UI element | Query |
|---|---|
| Students | `COUNT(*) FROM students` (simulated counted separately) |
| Conversations | `COUNT(*) FROM sessions` |
| Gaps identified | `COUNT(*) FROM insights WHERE kind='gap' AND status != 'dismissed'` |
| Insights generated | `COUNT(*) FROM insights` |
| Student row: open gaps | `COUNT(*) WHERE student_id=? AND kind='gap' AND status IN ('new','accepted')` |
| Evolution per concept | `evidence` grouped by `concept` and session order, with `n`; "insufficient evidence" if n < 3 |
| Gaps / suggestions / progress | `insights WHERE student_id=? ORDER BY updated_at DESC` |

### 4.7 Privacy rules for this pipeline

- The LLM call receives **no student name**; only the id and the transcript text.
- No raw audio stored; transcripts only.
- Fictional data in the hackathon; no real minors' data.
- Class context free text must not contain personal data.

## 5. Mock and integration plan

| Time | Available | Used by |
|---|---|---|
| Kickoff | Contracts, in-memory repository, fixtures (turn scripts + one event log with a clear gap) | everyone |
| ≤ H3 | P1: MongoDB repository + seed (students, class context, demo insights) | P3 switches off the stub |
| ~H3 | P3: `/api/dev/fixture-turn` and `turn-cli` | P2 builds the board against fixtures |
| H8 | P3: real `/turn` (text) | P2 integration |
| H8–H10 | P1: analysis running on the **fixture event log** | validates the pipeline before real sessions exist |
| H14 | P3 writes real events/evidence; P1 analysis runs on a real conversation | Integration 2 |
| H18 | Full demo: a real conversation produces a gap and a suggestion in the Students tab | Cut line |

### Integration test checklist

- [ ] **H1:** fixture and real `/turn` produce the same rendering; interruption aborts the stream and clears the queue.
- [ ] **H2:** after a real conversation, `events` and `evidence` rows exist and `session_ended` fires on leave, idle and tab close.
- [ ] **H3:** `searchChunks` returns pages for a Rome query; `validateCitation` rejects a fake quote; the prompt includes the class context and open gaps.
- [ ] **H4:** STT final transcripts become `user_message(kind=speech)`; TTS audio plays with word captions; the orb reacts to levels.
- [ ] **H5:** the teacher UI and the whiteboard look like one product (same tokens, chips, mascot).
- [ ] **End to end:** one wrong answer on the whiteboard → within ~60 s of ending the session, a **gap with the student's own words** and a **suggestion** appear in the Students tab, and the gap count and insight count increase.
