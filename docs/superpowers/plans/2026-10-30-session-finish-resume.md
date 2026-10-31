# Session Finish and Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit, idempotent finish and resume endpoints for stored whiteboard sessions, with exactly-once analysis triggering per active-to-ended transition.

**Architecture:** The session document is the current-state projection and the event collection remains the audit log. Repository methods perform conditional state transitions; HTTP routes trigger side effects only when a transition wins. The existing analysis service handles cache invalidation through its input hash and persists one analysis row per session.

**Tech Stack:** TypeScript 6, Fastify 5, Zod, MongoDB/Mongoose, Vitest, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-10-30-session-finish-resume-design.md`

## Global Constraints

- Keep `/api/sessions/:id/end` as a backwards-compatible alias.
- Do not call an internal HTTP endpoint to start analysis; call `SessionEndedHandler` in process.
- Do not wait for analysis before returning from finish.
- Preserve the same session id and append-only learning history across resume.
- Use snake_case for serialized and stored fields.
- Repository files, code, tests and documentation stay in English; product errors stay in pt-BR only when user-facing.
- Do not add dependencies, distributed jobs or MongoDB transactions.

---

### Task 1: Lifecycle contracts and in-memory repository

**Files:**
- Modify: `packages/contracts/src/events.ts`
- Modify: `packages/contracts/src/session-events.ts`
- Modify: `packages/contracts/src/sessions.ts`
- Modify: `packages/contracts/src/events.test.ts`
- Modify: `packages/contracts/src/sessions.test.ts`
- Modify: `packages/tutor/src/repository.ts`
- Modify: `packages/tutor/src/testing/memory-repository.ts`
- Create: `packages/tutor/src/testing/memory-repository.test.ts`

**Interfaces:**
- Produces: `SessionLifecycleTransition = "finished" | "already_finished" | "resumed" | "already_active" | "not_found"`.
- Produces: `TurnRepository.finishSession(session_id, reason)` and `TurnRepository.resumeSession(session_id)`.
- Produces: `SessionInfo.ended_at: string | null`.
- Produces: `FinishSessionResponse` and `ResumeSessionResponse` Zod schemas.
- Produces: `session_resumed` event with `{ previous_ended_at: string }`.

- [ ] **Step 1: Write failing contract tests**

Add assertions that `EventType` and `SessionEvent` accept `session_resumed`, and that lifecycle responses reject unknown transitions:

```ts
expect(EventType.parse("session_resumed")).toBe("session_resumed");
expect(SessionEvent.parse({
  id: "e1", session_id: "s1", seq: 1, ts: now,
  type: "session_resumed", payload: { previous_ended_at: now },
}).type).toBe("session_resumed");
expect(FinishSessionResponse.parse({ ok: true, transition: "finished" })).toEqual({ ok: true, transition: "finished" });
expect(ResumeSessionResponse.parse({ ok: true, transition: "resumed" })).toEqual({ ok: true, transition: "resumed" });
```

- [ ] **Step 2: Run contract tests and verify RED**

Run: `pnpm --filter @mento/contracts test -- events.test.ts sessions.test.ts`

Expected: FAIL because `session_resumed`, `FinishSessionResponse` and `ResumeSessionResponse` do not exist.

- [ ] **Step 3: Add failing in-memory lifecycle tests**

Test one transition and its idempotent repeat:

```ts
const repo = new InMemoryTurnRepository();
const { id } = await repo.createSession({ student_id: "s", modality: "text" });
expect(await repo.finishSession(id, "manual")).toBe("finished");
expect(await repo.finishSession(id, "manual")).toBe("already_finished");
expect((await repo.listEvents(id)).filter((e) => e.type === "session_ended")).toHaveLength(1);
expect((await repo.getSession(id))?.ended_at).not.toBeNull();
expect(await repo.resumeSession(id)).toBe("resumed");
expect(await repo.resumeSession(id)).toBe("already_active");
expect((await repo.listEvents(id)).filter((e) => e.type === "session_resumed")).toHaveLength(1);
expect((await repo.getSession(id))?.ended_at).toBeNull();
```

Also test unknown ids return `not_found` and concurrent `Promise.all([finish, finish])` produces one `finished`, one `already_finished` and one event.

- [ ] **Step 4: Run memory test and verify RED**

Run: `pnpm --filter @mento/tutor test -- memory-repository.test.ts`

Expected: FAIL because lifecycle methods and `ended_at` do not exist.

- [ ] **Step 5: Implement contracts and the in-memory state machine**

Add the event types/schemas and response schemas. Change `SessionInfo` and repository methods to:

```ts
export type SessionLifecycleTransition = "finished" | "already_finished" | "resumed" | "already_active" | "not_found";

export interface SessionInfo {
  id: string;
  student_id: string;
  modality: "text" | "voice";
  subject: SessionSubject | null;
  ended_at: string | null;
}

finishSession(session_id: string, reason: string): Promise<Extract<SessionLifecycleTransition, "finished" | "already_finished" | "not_found">>;
resumeSession(session_id: string): Promise<Extract<SessionLifecycleTransition, "resumed" | "already_active" | "not_found">>;
```

In memory, inspect and mutate the summary synchronously before the first `await`; append an event only for a winning transition. `session_resumed` clears `ended_at` and `end_reason` in `appendEvent`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `pnpm --filter @mento/contracts test -- events.test.ts sessions.test.ts && pnpm --filter @mento/tutor test -- memory-repository.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts packages/tutor/src/repository.ts packages/tutor/src/testing
git commit -m "feat(whiteboard): add idempotent session lifecycle contracts"
```

### Task 2: Atomic MongoDB lifecycle transitions

**Files:**
- Modify: `packages/db/src/mongo-turn-repository.ts`
- Modify: `packages/db/src/mongo-turn-repository.atlas.test.ts`

**Interfaces:**
- Consumes: lifecycle methods and `SessionInfo.ended_at` from Task 1.
- Produces: MongoDB conditional finish/resume transitions with one event per winning transition.

- [ ] **Step 1: Extend the Atlas integration test with lifecycle expectations**

Replace the one-off `endSession` assertion with:

```ts
expect(await repo.finishSession(id, "user_left")).toBe("finished");
expect(await repo.finishSession(id, "user_left")).toBe("already_finished");
expect((await repo.listEvents(id)).filter((e) => e.type === "session_ended")).toHaveLength(1);
const endedAt = (await repo.getSession(id))?.ended_at;
expect(endedAt).not.toBeNull();
expect(await repo.resumeSession(id)).toBe("resumed");
expect(await repo.resumeSession(id)).toBe("already_active");
expect((await repo.listEvents(id)).filter((e) => e.type === "session_resumed")).toHaveLength(1);
expect((await repo.getSession(id))?.ended_at).toBeNull();
```

Add a concurrent finish test using `Promise.all`, and unknown-id assertions.

- [ ] **Step 2: Run the Atlas test and verify RED**

Run: `ATLAS_TEST_URI="$MONGODB_URI" pnpm --filter @mento/db test -- mongo-turn-repository.atlas.test.ts`

Expected: FAIL because `finishSession`, `resumeSession` and `ended_at` on `getSession` do not exist.

- [ ] **Step 3: Implement conditional MongoDB transitions**

Use `findOneAndUpdate` with `ended_at: null` for finish and `ended_at: { $ne: null }` for resume. When a conditional update returns null, query existence to distinguish the idempotent state from `not_found`. Append lifecycle events only after a winning transition. Return `ended_at` from `getSession`.

For resume, capture the previous timestamp from the returned pre-update document and append:

```ts
await EventModel.create({
  session_id,
  ts: now,
  type: "session_resumed",
  payload: { previous_ended_at: previous.ended_at.toISOString() },
});
```

- [ ] **Step 4: Run database tests and verify GREEN**

Run: `ATLAS_TEST_URI="$MONGODB_URI" pnpm --filter @mento/db test -- mongo-turn-repository.atlas.test.ts`

Expected: PASS with exactly one lifecycle event for duplicate and concurrent calls.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/mongo-turn-repository.ts packages/db/src/mongo-turn-repository.atlas.test.ts
git commit -m "feat(whiteboard): persist atomic session lifecycle transitions"
```

### Task 3: Finish, resume and ended-turn HTTP behavior

**Files:**
- Modify: `apps/api/src/routes/sessions.ts`
- Modify: `apps/api/src/routes/turn.ts`
- Modify: `apps/api/src/routes/turn.test.ts`
- Modify: `apps/api/test/teacher.test.ts`

**Interfaces:**
- Consumes: repository lifecycle methods from Tasks 1–2.
- Produces: `POST /api/sessions/:id/finish`, `POST /api/sessions/:id/resume`, compatible `/end`, and 409 turns for ended sessions.

- [ ] **Step 1: Write failing route tests**

In `turn.test.ts`, cover:

```ts
const first = await post(`${base}/api/sessions/${id}/finish`, { reason: "manual" });
expect(first.status).toBe(200);
expect(await first.json()).toEqual({ ok: true, transition: "finished" });
expect(await post(`${base}/api/sessions/${id}/turn`, validTurn)).toMatchObject({ status: 409 });
expect(await post(`${base}/api/sessions/${id}/finish`, { reason: "manual" }).then((r) => r.json()))
  .toEqual({ ok: true, transition: "already_finished" });
expect(await postWithoutBody(`${base}/api/sessions/${id}/resume`).then((r) => r.json()))
  .toEqual({ ok: true, transition: "resumed" });
expect((await post(`${base}/api/sessions/${id}/turn`, validTurn)).status).toBe(200);
```

Also call `/end` and `/finish` against one session and assert one `session_ended` event.

- [ ] **Step 2: Write a failing analysis-trigger test**

Provide a fake `sessionEnded` with a counted `handle`. Assert two finishes call it once, resume then finish calls it a second time, and `already_finished` never calls it.

- [ ] **Step 3: Run route tests and verify RED**

Run: `pnpm --filter @mento/api test -- src/routes/turn.test.ts test/teacher.test.ts`

Expected: FAIL with missing `/finish` and `/resume` routes and no ended-session guard.

- [ ] **Step 4: Implement one shared finish handler and resume route**

In `sessions.ts`, make `/finish` and `/end` delegate to the same function. On `finished`, call `engine?.forget(id)`, `tts?.cancelAll()` and start `sessionEnded.handle(id)` without awaiting it. On `resumed`, call `engine?.forget(id)` then `engine?.prewarm(id)` in the background. Map `not_found` to 404.

In `turn.ts`, after `getSession`:

```ts
if (!session) return reply.status(404).send({ error: "session_not_found" });
if (session.ended_at) return reply.status(409).send({ error: "session_ended" });
```

- [ ] **Step 5: Run focused API tests and verify GREEN**

Run: `pnpm --filter @mento/api test -- src/routes/turn.test.ts test/teacher.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/sessions.ts apps/api/src/routes/turn.ts apps/api/src/routes/turn.test.ts apps/api/test/teacher.test.ts
git commit -m "feat(whiteboard): add finish and resume session endpoints"
```

### Task 4: Reanalysis regression, documentation and full verification

**Files:**
- Modify: `packages/analysis/test/service.test.ts`
- Modify: `apps/api/test/teacher.test.ts`
- Modify: `docs/frontend-integration.md`
- Modify: `docs/10-decisions.md`
- Modify: `workstreams/contracts-spec.md`
- Create: `prompts/sessions/03-whiteboard-backend/2026-10-30-22-session-finish-and-resume.md`
- Modify: `prompts/sessions/03-whiteboard-backend/log.md`

**Interfaces:**
- Consumes: finish/resume endpoints and existing `AnalysisService` input-hash behavior.
- Produces: regression proof that resumed sessions update one analysis and stable open insights.

- [ ] **Step 1: Add the resumed-session analysis regression test**

Build a mutable `ConversationSource` fixture. Run analysis once, append `session_resumed`, new learning events/evidence and a second `session_ended`, then run again. Assert:

```ts
expect(second.cached).toBe(false);
expect(second.analysis.id).toBe(first.analysis.id);
expect(second.analysis.attempts).toBe(2);
const open = await repo.listInsights({ student_id, concept_key: "formas de governo", status: ["new", "accepted"] });
expect(open.filter((i) => i.kind === "gap")).toHaveLength(1);
expect(new Set(open.flatMap((i) => i.evidence.map((e) => e.event_id))).size)
  .toBe(open.flatMap((i) => i.evidence).length);
```

Also cover resume+finish with no new learning event returning `cached: true` and `attempts: 1`.

- [ ] **Step 2: Run analysis tests and verify behavior**

Run: `pnpm --filter @mento/analysis test -- service.test.ts`

Expected: PASS. If the new test exposes duplicate insight creation, fix only `persistInsights` or the repository operation necessary to make this exact sequential lifecycle idempotent, then rerun RED/GREEN for that change.

- [ ] **Step 3: Update integration documentation and decision log**

Document:

- `/finish`, `/resume` and `/end` alias request/response shapes;
- 409 from `/turn` while ended;
- frontend sequence: GET history → POST resume → send turn → POST finish;
- one analysis per session id, recomputed only when append-only learning input changes;
- new decision in `docs/10-decisions.md` and `session_resumed` in `contracts-spec.md`.
- the founder request and approved lifecycle design in the Person 3 prompt log.

- [ ] **Step 4: Run contract fixtures and focused lifecycle suites**

Run:

```bash
pnpm fixtures:check
pnpm --filter @mento/contracts test
pnpm --filter @mento/tutor test
pnpm --filter @mento/analysis test
pnpm --filter @mento/api test
```

Expected: all pass.

- [ ] **Step 5: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
git diff --check origin/main...HEAD
```

Expected: exit 0 for every command.

- [ ] **Step 6: Commit documentation and regression coverage**

```bash
git add packages/analysis/test/service.test.ts apps/api/test/teacher.test.ts docs/frontend-integration.md docs/10-decisions.md workstreams/contracts-spec.md prompts/sessions/03-whiteboard-backend
git commit -m "test(whiteboard): verify resumed sessions reanalyse idempotently"
```

- [ ] **Step 7: Push and create the pull request**

```bash
git push -u origin feat/whiteboard-session-lifecycle
gh pr create --base main --head feat/whiteboard-session-lifecycle \
  --title "feat(whiteboard): add idempotent session finish and resume" \
  --body-file <prepared-pr-body>
```

Attach the resulting PR URL to the Codex task.
