# Session finish and resume design

> Status: approved in chat on 2026-10-30. Branch: `feat/whiteboard-session-lifecycle`.

## 1. Goal

Give stored whiteboard sessions an explicit, idempotent lifecycle:

- finishing an active session records one `session_ended` event and starts the existing post-session analysis;
- finishing an already ended session is a successful no-op;
- resuming an ended session makes the same session writable again and records one `session_resumed` event;
- resuming an active session is a successful no-op;
- finishing again after new turns recomputes the same session analysis without duplicating analysis rows or open insights.

This preserves the same session id, board, transcript and tutor history when the student continues from the history screen.

## 2. Non-goals

- Do not create a child session when resuming.
- Do not call the analysis HTTP route from another API route. Both routes use the same in-process service.
- Do not wait for analysis to finish before answering the finish request.
- Do not redesign the teacher analysis rules or insight UI.
- Do not add distributed jobs or transactions for the hackathon's single API process.

## 3. Current behavior and defects

`POST /api/sessions/:id/end` already calls `SessionEndedHandler`, which runs the analysis asynchronously. The analysis side already has:

- one `analyses` row per `session_id` (unique MongoDB index);
- an input hash cache;
- a per-session in-process queue;
- evidence merging by `event_id`;
- update-before-create behavior for open insights of the same student, concept and kind.

The missing lifecycle rules are:

- `MongoTurnRepository.endSession` always appends another `session_ended` event;
- every `/end` request starts another analysis handler;
- `/turn` accepts ended sessions;
- reopening history and sending a turn implicitly resumes a session without clearing `ended_at`;
- no `session_resumed` event explains the transition in the append-only log.

## 4. State machine

```text
                  finish
        active ─────────────► ended
          ▲                    │
          │       resume       │
          └────────────────────┘

finish(ended)  = ended, no event, no analysis trigger
resume(active) = active, no event
turn(ended)    = 409 until resume succeeds
```

The session document remains the current-state projection. Events remain the ordered audit log.

## 5. HTTP API

### `POST /api/sessions/:id/finish`

Request body uses the existing `EndSessionRequest`:

```json
{ "reason": "manual" }
```

Success response, always HTTP 200:

```json
{ "ok": true, "transition": "finished" }
```

or:

```json
{ "ok": true, "transition": "already_finished" }
```

Only `transition: "finished"` starts `sessionEnded.handle(id)`, forgets the tutor runtime and cancels session audio. The analysis remains asynchronous and is read through the existing `GET /api/sessions/:id/analysis` route.

### `POST /api/sessions/:id/resume`

No request body.

Success response, HTTP 200:

```json
{ "ok": true, "transition": "resumed" }
```

or:

```json
{ "ok": true, "transition": "already_active" }
```

Only `transition: "resumed"` clears the cached tutor runtime and starts prompt-cache prewarming. The next turn reconstructs the board and conversation state from all stored events.

### Compatibility

Keep `POST /api/sessions/:id/end` as a deprecated alias of `finish`. It uses the same transition operation, so an old frontend and a new frontend cannot double-finish the session. Its response remains compatible with clients that only inspect `ok`.

Unknown session ids return 404. A turn on an ended session returns HTTP 409 with `{ "error": "session_ended" }`.

## 6. Repository operations

Replace the append-only `endSession` command with explicit conditional transitions:

```ts
finishSession(session_id, reason): Promise<"finished" | "already_finished" | "not_found">
resumeSession(session_id): Promise<"resumed" | "already_active" | "not_found">
```

MongoDB uses conditional `findOneAndUpdate` filters:

- finish matches `_id` with `ended_at: null`, sets `ended_at`, `end_reason` and `last_activity_at`;
- resume matches `_id` with `ended_at != null`, clears `ended_at` and `end_reason`, and updates `last_activity_at`.

Only the caller that wins the state transition appends its lifecycle event. This makes concurrent duplicate requests idempotent in the current single-database deployment. The in-memory repository implements the same semantics for tests.

Add `ended_at` to the tutor's `SessionInfo` so `/turn` can reject ended sessions before creating events or invoking providers.

## 7. Events and analysis behavior

Add `session_resumed` to both the loose and typed event taxonomies, with payload:

```ts
{ previous_ended_at: string }
```

The analysis input ignores both lifecycle event types when constructing turns and counters. Therefore:

- resume followed by finish with no new learning events has the same input hash and returns the cached analysis;
- resume followed by new turns/evidence changes the input hash and recomputes;
- `saveAnalysis` updates the unique row for that `session_id`;
- insight persistence updates the existing open concept rows and deduplicates evidence by `event_id`.

Because session history is append-only, a resumed analysis contains the original and new learning evidence. A second finish must not force analysis: the changed input naturally invalidates the cache, while unchanged input naturally remains cached.

## 8. Failure and concurrency behavior

- Finishing succeeds even if background analysis later fails; the existing retry behavior remains responsible for recovery.
- A duplicate finish does not trigger a retry or a second analysis. Explicit reanalysis remains available through `POST /api/sessions/:id/analysis?force=true` and the dev route.
- Duplicate resume and finish calls are resolved by conditional database updates, not by a read-then-write check in the HTTP route.
- If lifecycle-event insertion fails after the document transition, the request fails and logs the inconsistency. Cross-document MongoDB transactions are deliberately out of scope for the hackathon; the session document remains the authoritative current state.

## 9. Tests

Use TDD and cover:

1. finish active session: one event, ended projection, one analysis trigger;
2. finish twice: second response is `already_finished`, one event, one trigger;
3. two concurrent finishes: exactly one transition wins;
4. resume ended session: projection becomes active and one `session_resumed` event is appended;
5. resume twice: second response is `already_active`, one event;
6. turn while ended: 409 and no new tutor/user events;
7. finish → resume → finish without new turns: cached analysis, one analysis row, stable insight count;
8. finish → resume → new events/evidence → finish: analysis recomputes the same row and updates insights without duplicating the open concept;
9. `/end` and `/finish` called for the same active session: one finish transition and one analysis trigger;
10. history detail exposes the changed `ended_at` state after each transition.

Run the focused suites first, then `pnpm test` and `pnpm typecheck`.

## 10. Documentation and ownership

- Person 3 owns the session lifecycle and its whiteboard routes.
- Person 1's `SessionEndedHandler` and analysis service are consumed without changing their public behavior.
- Update `docs/frontend-integration.md` with `finish`, `resume`, 409 handling and the deprecated `/end` alias.
- Record the lifecycle decision in `docs/10-decisions.md`.
