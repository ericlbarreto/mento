# 2026-10-30 (time not recorded) — Sessions in MongoDB with history, and the tutor model research

- **Person / agent:** Person 3 (founder as proxy) / Claude Code (Opus 5.5)
- **Task id** (from your workstreams file): persistence + T11 (latency)
- **Docs read first:** docs/teacher-data-integration.md, docs/frontend-integration.md, Anthropic effort docs

## Prompt (verbatim)

```text
Show, seguinte: o que é que eu queria ver com você? O que está faltando? São algumas coisas:

* A gente precisa criar sessão. Tem que estar tudo no banco. Veja que a gente vai precisar exibir isso no histórico, então você precisa criar essas entidades. Toda vez que, por exemplo, eu crio um chat, eu preciso salvar isso no banco para poder utilizar. Uma vez que, por exemplo, se eu clicar no histórico de sessões, eu meio que vou renderizar isso na tela.
* Sobre a questão dos agentes, eu acho que o Soner talvez não seja um modelo ideal para isso. Eu queria que você fizesse uma deep research para poder entender qual seria o modelo ideal. Eu acho que é sonhar um pouco com o thinking, e a gente precisa de algo bem mais rápido. Talvez, se você usar o GLM ou algum outro modelo como esse, seja mais fácil de orquestrar o STT e o TTS.
```

## Outcome (English)

Sessions, events and evidence are now stored in MongoDB (`sessions`, `events`, `evidence`; `MongoTurnRepository`, `MongoEvidenceStore` in `@mento/db`), wired as the API defaults; routes answer 503 `database_unavailable` at once when MongoDB is down. New history endpoints: `GET /api/sessions?student_id=&subject_id=&limit=` (newest first, with title = first student message, subject, turn count, end) and `GET /api/sessions/:id` (summary + every event, to re-render the board and the transcript). Late drawing results are now stored too, so re-opened sessions show their images. Verified end to end: a real conversation was created, the API restarted, and the history returned it with its events. Model research written to `docs/superpowers/research/2026-10-30-tutor-model-latency.md`: the ~4 s comes mostly from Sonnet 5.5's adaptive thinking (~3 s before the first tool call; Anthropic documents `thinking: {"type": "between_tools"}` to remove it); GLM-5.x first-token times are reported at ~0.8–1.2 s on fast hosts but are unproven for our Portuguese, tool-heavy prompt. Recommendation: change the Sonnet setting and compare with Haiku 5.5 first; try GLM or DeepSeek through an OpenAI-compatible client only if both miss 1.5 s.

## Files changed

- `packages/contracts/src/sessions.ts` (history contracts); `packages/db/src/models/session.model.ts`, `event.model.ts`, `evidence.model.ts`; `packages/db/src/mongo-turn-repository.ts` (+ unit and Atlas tests); `packages/tutor/src/turn-engine.ts`, `testing/memory-repository.ts`; `apps/api/src/app.ts`, `container.ts`, `routes/sessions.ts` (+ `routes/history.test.ts`); removed `apps/api/src/with-catalog.ts`; `docs/frontend-integration.md`, `docs/teacher-data-integration.md`, `docs/superpowers/research/2026-10-30-tutor-model-latency.md`

## Decisions and contracts touched

- New contracts `SessionSummary`, `ListSessionsQuery`, `ListSessionsResponse`, `SessionDetailResponse`, `SessionHistory`. Conversations persist in MongoDB (previously in memory).

## Follow-ups / questions for other people

- Person 2: history screen from `GET /api/sessions` and re-render from `GET /api/sessions/:id` (guide §3).
- Person 1: `getClassContext` and `getLearnerSummary` in `MongoTurnRepository` are still defaults.
- Founder: approve the model bench (Sonnet `between_tools` vs Haiku 5.5).

## Commit / PR

- 6ee3d49, c88ae09, e366c47, 0af155a, 314d48a on `feat/whiteboard-api`
