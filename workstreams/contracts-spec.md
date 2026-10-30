# Contracts spec — the one canonical definition of the shared shapes

> Status: **canonical, proposed 2026-10-30**; to be frozen in `packages/contracts` (Zod) at kickoff. If any other document disagrees with this file, **this file wins** and the other document must be fixed. Used by Person 1 (teacher side), Person 2 (whiteboard front-end) and Person 3 (whiteboard back-end). Pipeline narrative: `handoffs-and-insights-pipeline.md`; turn protocol: `docs/16-technical-roadmap.md` §3–4.

## 0. Why this file exists (alignment audit, 2026-10-30)

An audit of the docs found that the teacher side and the whiteboard back-end described the same data in **different shapes**. They are fixed here:

| # | Mismatch found | Resolution (this spec) |
|---|---|---|
| 1 | Event types differed between `docs/16` §3.4 (`element_added`, `mic_muted`…), `handoffs` (`verification_asked`, `hint_used`, `session_ended`…) and `docs/07` (`user_text`) | One event list: §3 |
| 2 | `kind` vs `type` for user messages; `snake_case` (`element_id`, `outside_material`) vs `camelCase` (`elementId`, `outsideMaterial`) | One casing rule: §1 |
| 3 | Citations as `{source_id}` (`docs/16`) vs `{material_id}` (`docs/04`) | `{material_id, page, quote}`: §4 |
| 4 | Evidence stored `correct` as a boolean, but the judge returns `correct / partial` | `result` enum: §5 |
| 5 | `independent` needs hint data, but **no event or tool produced hints** | `speak.purpose` / `hint_level` → `hint_given` event: §3, §6 |
| 6 | Concept labels are free text written by two different people (tutor/judge and analysis); gaps would not match across sessions | Shared `concept` + `concept_key` rules: §7 |
| 7 | Evidence stored `chunk_id` while citations use `material_id + page + quote` | `citation` JSON on evidence: §5 |

## 1. Conventions

- **Field names are `snake_case` everywhere a shape is stored or serialized** (SSE messages, HTTP bodies, `events.payload`, analysis JSON, DB columns) **and in the TypeScript types of those objects**. `camelCase` is only for local variables and function names. (One convention means no mapping code and no mismatches.)
- **Ids (D46, MongoDB):** DB documents have an `_id` ObjectId, exposed in every contract as `id: string` (24-hex). Wherever the sketches below show `id: number` / `*_id: number`, read `string`; `Event.id` ordering uses the ObjectId (monotonic per process) or a `seq` counter. Board elements, actions, turns and verifications have string ids (`el_…`, `act_…`, `turn_…`, `ver_…`).
- **Timestamps:** ISO 8601 UTC strings in JSON; `ts` columns store the same string.
- **Enums are closed lists** (below); unknown values are rejected by Zod, not silently stored.
- **No student names** in anything sent to an LLM; the id only.

## 2. Event envelope

```ts
type Event = {
  id: number;            // returned by appendEvent; insight evidence points to it
  session_id: number;
  ts: string;
  type: EventType;       // §3
  payload: unknown;      // shape depends on type (§3)
};
```

## 3. Event taxonomy (the only list)

| `type` | Written by | `payload` | Read by |
|---|---|---|---|
| `session_started` | Repository (`createSession`) | `{ student_id, material_id, topic?, modality, persona? }` | Analysis |
| `user_message` | Person 3 (turn handler) | `{ kind: "chat" \| "speech" \| "board_select" \| "quick_action", text, selected?: { element_id, text? }, stt?: { provider, duration_ms, confidence? } }` | Analysis, replay |
| `tutor_action` | Person 3 (each streamed action) | `{ turn_id, action_id, order, name, args }` (`name` = a tool in `docs/16` §4, including `draw_result`) | Analysis, replay, board state |
| `verification_asked` | Person 3 | `{ verification_id, element_id, concept, concept_key, question, kind }` | Analysis |
| `verification_answered` | Person 3 | `{ verification_id, element_id, answer }` | Analysis |
| `hint_given` | Person 3 (derived from `speak.purpose = "hint"`) | `{ turn_id, level: 1 \| 2 \| 3, verification_id?, concept_key? }` | Analysis |
| `evidence_recorded` | Person 3 (after the judge) | `{ evidence_id, verification_id?, concept, concept_key, result, independent, hints_used, rationale, citation? }` | Analysis |
| `interrupted` | Person 3 | `{ turn_id, action_id? }` | Analysis (optional) |
| `mic_state` | Person 3 (voice) | `{ muted: boolean }` | — |
| `turn_timing` | Person 3 | `{ turn_id, first_action_ms, last_action_ms, tts_first_audio_ms?, image_ready_ms? }` | Monitoring |
| `session_ended` | Repository (`endSession`) | `{ reason: "user_left" \| "idle_timeout" \| "beacon" \| "manual" }` | Triggers the analysis |

**Client → server messages** (sent over HTTP; stored only as the events above):

| Message | Fields | Stored as |
|---|---|---|
| user message | `{ kind, text, selected?: { element_id, text? } }` | `user_message` |
| answer to a verification | `{ verification_id, element_id, answer }` | `verification_answered` (+ a `user_message` of kind `chat`/`speech` if typed or spoken) |
| interruption | `{ turn_id, action_id?, spoken_chars? }` | `interrupted` |
| end of conversation | `POST /api/sessions/:id/end` `{ reason }` | `session_ended` (via `endSession`) |

**Not events:** the board's current state is **derived** from `tutor_action` events (including `draw_result`); there are no separate `element_added/edited` events in our system (those were Studdy's naming). Raw audio is never stored.

## 4. Citation

```ts
type Citation = { material_id: number; page: number; quote: string };
```

Used in `sources[]` on `speak`/`write_text` and in `evidence.citation`. The `quote` must occur in that material page (validated by Person 1's `validateCitation`).

## 5. Evidence and the judge

```ts
type Evidence = {
  id: number; session_id: number; student_id: number;
  concept: string;                 // human label, pt-BR, ≤ 60 chars
  concept_key: string;             // normalizeConcept(concept), §7
  result: "correct" | "partial" | "incorrect";
  independent: boolean;            // true when no hint was needed for this answer
  hints_used: number;              // hints given between the question and the answer
  rationale: string;               // short, from the judge
  citation?: Citation;
  ts: string;
};
```

DB `evidence` columns: `id, session_id, student_id, concept, concept_key, result, independent, hints_used, rationale, citation (JSON, nullable), ts`. (Replaces the earlier `correct` boolean and `chunk_id`.) The judge returns `{ result, independent, rationale }`; `hints_used` and `independent` are **computed from the `hint_given` events** between `verification_asked` and `verification_answered`.

## 6. Hints (so `independent` is real)

The tutor's `speak` (and `write_text`) accepts two optional fields: `purpose: "explain" | "hint" | "praise" | "question" | "transition"` and `hint_level: 1 | 2 | 3` (required when `purpose = "hint"`). The turn handler emits a `hint_given` event for each. The prompt must tell the model to set `purpose = "hint"` whenever it gives a hint on an open verification.

## 7. Concepts (shared vocabulary)

- `concept` is a short pt-BR label; `concept_key = normalizeConcept(concept)` where `normalizeConcept` is **one shared function in `@mento/contracts`**: lowercase → Unicode NFD → strip diacritics → non-alphanumeric to space → collapse spaces → trim.
- **Person 3 must reuse labels** in this priority: (1) labels of the student's **open gaps** (from `getLearnerSummary`); (2) **chapter/section titles** of the chosen material (from `getOutline`); (3) a new short label.
- **Person 1 matches** by `concept_key` first, then by the LLM's `matches_gap_id`; it stores `concept_key` on `insights` as well.
- No `concepts` table (keep the data model small).

## 8. Insights, analysis input/output, learner summary (snake_case)

```ts
type Insight = {
  id: number; student_id: number; session_id: number;
  kind: "gap" | "progress" | "suggestion";
  concept: string; concept_key: string;
  title: string; body: string;
  confidence?: number;                                  // gaps only, 0..1
  evidence: { event_id: number; quote: string }[];
  status: "new" | "accepted" | "dismissed" | "resolved";
  created_at: string; updated_at: string;
};

type LearnerSummary = {
  open_gaps: { concept: string; concept_key: string; description: string; confidence: number }[];   // top 5; dismissed excluded
  recent_progress: { concept: string; description: string }[];                                      // top 3
};
```

Analysis input (assembled by Person 1) and output (validated with Zod):

```json
{ "student_id": 3,
  "class_context": { "grade_level": "8º ano", "description": "..." },
  "material": { "title": "...", "subject": "História" },
  "counters": { "user_messages": 9, "hints_given": 2, "verifications": 3, "correct": 1, "independent_correct": 1 },
  "evidence": [ { "id": 41, "concept": "...", "concept_key": "...", "result": "incorrect", "independent": false, "hints_used": 2, "rationale": "..." } ],
  "turns": [ { "event_id": 101, "role": "student", "text": "..." }, { "event_id": 102, "role": "tutor", "text": "..." } ],
  "open_gaps": [ { "id": 7, "concept": "...", "concept_key": "..." } ] }
```

```json
{ "gaps": [ { "matches_gap_id": 7, "concept": "...", "description": "...", "confidence": 0.6,
              "evidence": [ { "event_id": 101, "quote": "..." } ] } ],
  "progress": [ { "concept": "...", "description": "...", "evidence": [ { "event_id": 118, "quote": "..." } ] } ],
  "suggestions": [ { "concept": "...", "title": "...", "body": "...", "rationale": "..." } ] }
```

`turns` are built from events: student turns from `user_message.text` and `verification_answered.answer`; tutor turns from `tutor_action` where `name = "speak"` (`args.text`) and `write_text` (plain text of `args.html`).

## 9. Repository interface (TypeScript sketch; fields in snake_case)

```ts
interface Repository {
  // Written/read by Person 3
  createSession(i: { student_id: number; material_id: number; topic?: string; persona?: string; modality: "text" | "voice" }): Promise<{ id: number }>;
  appendEvent(session_id: number, e: { type: EventType; payload: unknown }): Promise<Event>;     // returns the stored event with its id
  listEvents(session_id: number, opts?: { after_id?: number }): Promise<Event[]>;
  endSession(session_id: number, reason: SessionEndReason): Promise<void>;                          // appends session_ended, publishes it on the EventBus
  insertEvidence(e: Omit<Evidence, "id">): Promise<{ id: number }>;
  getClassContext(): Promise<{ grade_level: "7º ano" | "8º ano" | "9º ano"; description: string }>;
  getLearnerSummary(student_id: number): Promise<LearnerSummary>;
  searchChunks(material_id: number, query: string, k: number): Promise<Chunk[]>;
  getPages(material_id: number, pages: number[]): Promise<Chunk[]>;
  getOutline(material_id: number): Promise<{ title: string; start_page: number; end_page: number }[]>;
  validateCitation(c: Citation): Promise<boolean>;
  // Read by the whiteboard start screen (through the API)
  listStudents(): Promise<{ id: number; name: string }[]>;
  listMaterials(opts?: { ready_only?: boolean }): Promise<MaterialSummary[]>;
  // Used by Person 1 (analysis and teacher UI)
  listInsights / upsertInsight / setInsightStatus / metrics ...   // internal to Person 1's packages
}
```

## 10. How we prove the two sides match (not just promise it)

1. **Fixtures with the real shapes** live in `fixtures/events/` (a conversation with a clear wrong answer and hints) and `fixtures/turns/` (turn scripts). `fixtures:check` validates all of them against the Zod schemas in CI.
2. **Round-trip contract test (the key one):** run Person 3's recorded fixture conversation through the **in-memory repository** and then through **Person 1's `buildAnalysisInput`**; assert it produces valid input, with `turns`, `evidence`, `counters` and `open_gaps` filled. Run in CI from kickoff.
3. **Analysis dry run on the same fixture:** the output must validate and every `quote` must occur in the cited event text.
4. **Seed uses the same shapes:** `scripts/seed.ts` inserts demo events/evidence/insights through the same schemas.
5. **Integration checkpoint H14** (`workstreams/README.md`): one real conversation → a gap with the student's own quote appears in the Students tab, with the same `concept_key` the tutor used.

## 11. Change rule

This file and `packages/contracts` change **together**, additively, after a message to the other two people. Never rename a field in place; add the new one, migrate, then remove the old one.
