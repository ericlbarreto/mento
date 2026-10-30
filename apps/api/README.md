# @mento/api — Fastify backend

The **only composition root**: it wires the packages (`container.ts`) and exposes the HTTP/SSE API under `/api`. Business logic lives in `packages/*`; routes are thin (parse with Zod → call a package → respond). See `docs/21-repo-structure.md` §5.

```bash
pnpm dev:api      # http://localhost:4000  (GET /health, GET /api/ping, GET /api/ping/stream, GET /api/openapi.json)
pnpm --filter @mento/api test
```

| File | Endpoints | Owner |
|---|---|---|
| `routes/ping.ts` | `GET /api/ping`, `GET /api/ping/stream` (proves Zod + SSE wiring) | shared (K1) |
| `routes/students.ts` | `GET/POST /students`, `GET /students/:id` | Person 1 |
| `routes/sessions.ts` | `POST /sessions`, `GET /sessions/:id/events` | Person 1 |
| `routes/turn.ts` | `POST /sessions/:id/turn` (SSE), `POST /sessions/:id/end` | Person 3 |
| `routes/voice.ts` | `POST /voice/token`, `POST /tts` | Person 3 |
| `routes/overview.ts` | `GET /overview` | Person 1 |
| `routes/class-context.ts` | `GET/PUT /class-context` | Person 1 |
| `routes/insights.ts` | `PATCH /insights/:id` | Person 1 |
| `routes/materials.ts` | `GET/POST /materials`, `GET /materials/:id` | Person 1 |
| `routes/files.ts` | `GET /files/:id` | Person 1 |
| `routes/teacher-stream.ts` | `GET /stream/teacher` (SSE live feed) | Person 1 |
| `routes/dev-fixtures.ts` | `GET /dev/fixture-turn?name=` | Person 3 |
| `routes/dev-analyze.ts` | `POST /dev/analyze/:sessionId` | Person 1 |

Every file in `routes/` is **autoloaded** under the `/api` prefix: adding a route never touches a shared file. Shared files (`server.ts`, `app.ts`, `container.ts`, `plugins/`, `config.ts`): small additive edits, announce them.
