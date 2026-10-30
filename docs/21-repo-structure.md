# 21 — Repository structure (monorepo with a separate API service)

> Status: **proposed layout, to be created at kickoff (K1)**. Tool versions and exact config values are marked *(verify at kickoff)*. Last updated: 2026-10-30.
> **Decisions:** D28 (monorepo) and **D43 (separate backend service; Next.js is frontend only)**. D43 **supersedes** the earlier plan of serving the API from Next.js route handlers. Lanes, contracts, checkpoints and ownership still follow `17-work-split.md` and `workstreams/`; only **where the routes live** changes (`apps/api`).

## 1. Why a separate API service

- **Real-time and long-lived work:** SSE turn streams, live teacher updates, background jobs (material ingestion, analysis), provider streaming. A dedicated Node server is a better home than framework route handlers.
- **Scalability seams:** the backend can be deployed, scaled and observed independently of the UI; stateless instances behind a load balancer later (§6).
- **Clear external contract:** a stable HTTP/SSE API (with an OpenAPI description) that other systems and teammates can integrate with.
- **Cleaner ownership:** each person owns route files and packages; the frontend never contains server code.
- **Cost kept low:** still one monorepo, pnpm workspaces, no Turborepo/Nx.

## 2. Tooling

| Area | Choice | Notes |
|---|---|---|
| Workspaces | **pnpm workspaces** | Strict `node_modules`: a package cannot import an undeclared internal package |
| Node | Current LTS, pinned in `.nvmrc` and `engines` *(verify)* | |
| Language | TypeScript `strict`, **ESM everywhere** | `tsconfig.base.json` + per-package `tsconfig.json` |
| **Frontend** | **Next.js (App Router) in `apps/web`, UI only** (no API routes) | Calls the API directly via `NEXT_PUBLIC_API_URL` |
| **Backend** | **Fastify (Node, TypeScript) in `apps/api`** *(recommended; see §2.1)* | Zod type provider, SSE, WebSocket-ready, Pino logs |
| Real-time | **SSE** for the turn stream and the teacher live feed; `@fastify/websocket` available if a bidirectional channel is needed | STT stays browser → Deepgram |
| Uploads | `@fastify/multipart` | PDF upload |
| CORS | `@fastify/cors` (allow `WEB_ORIGIN`) | Direct browser → API (see risks about proxies) |
| API docs | `@fastify/swagger` + Zod provider (OpenAPI) | Nice-to-have; helps integrations |
| Validation | Zod in `@mento/contracts`, reused by API and web | |
| Jobs / events / files | In-process implementations behind **interfaces** (`JobQueue`, `EventBus`, `FileStore`) | Swap for Redis/BullMQ/S3 later (§6) |
| DB | **MongoDB via Mongoose** behind the `Repository` interface (D46) | Managed Atlas cluster |
| Styling | Tailwind (+ shadcn/ui primitives in `@mento/ui`) | |
| Tests | Vitest per package; API tests with Fastify's `inject` | Contract tests validate every fixture |
| Lint/format | ESLint (flat) + Prettier at the root | |
| CI | GitHub Actions: install, typecheck, lint, test | |

### 2.1 Backend framework choice

| Option | Strengths | Weaknesses | Verdict |
|---|---|---|---|
| **Fastify** | Low overhead (commonly benchmarked faster than Express; not verified here), built-in schema validation, plugin system, good TypeScript story, simple SSE/WebSocket, small learning curve | Fewer enforced conventions than Nest | **Recommended**: practical, fast, scalable enough, quick to learn |
| **NestJS** | Strong structure (modules, DI, guards, gateways); modules map neatly to people | More boilerplate and decorators; slower first hours; Zod needs an adapter | Pick it **only if the team already knows Nest** (it can run on Fastify) |
| **Express** | Most familiar | Older, no built-in validation/types, async error quirks, weaker structure for growth | Acceptable fallback, not the recommendation |
| **Hono** | Tiny, great streaming, runs anywhere | Smaller Node ecosystem for uploads/WS | Fine, but less of the "robust" feel you asked for |

*Open question Q20: confirm Fastify (or choose NestJS).*

## 3. Directory tree

```
mento/
├─ apps/
│  ├─ web/                          Next.js frontend only (@mento/web)
│  │  ├─ public/brand/              logo, mascot, GIFs, icons (copied from assets/)
│  │  ├─ src/app/
│  │  │  ├─ (student)/              start screen, tutor session page
│  │  │  ├─ (teacher)/              Alunos tab (metrics, list, detail, class context), Materiais tab
│  │  │  ├─ icon.png, apple-icon.png, layout.tsx, globals.css
│  │  ├─ src/lib/api.ts             typed fetch/SSE client built on @mento/contracts
│  │  └─ next.config.ts, tailwind config, tsconfig.json, package.json
│  └─ api/                          Fastify backend (@mento/api) — the only composition root
│     ├─ src/
│     │  ├─ server.ts               bootstrap: plugins, error handler, request ids, graceful shutdown, autoload routes
│     │  ├─ container.ts            wiring: repository, tutor, sources, analysis, voice, jobs, bus, files
│     │  ├─ plugins/                cors, multipart, websocket, swagger, sse helper
│     │  ├─ routes/                 one file per area (autoloaded, prefix /api) — see §5
│     │  └─ config.ts               env parsing with Zod
│     └─ tsconfig.json, package.json
├─ packages/
│  ├─ contracts/   @mento/contracts  Zod schemas (actions, SSE, events, citations), Repository, SpeechPlayer, EventBus, JobQueue, FileStore
│  ├─ ui/          @mento/ui         tokens (CSS variables), Button, Card, Chip, Avatar, Drawer, Table, InsightCard
│  ├─ board/       @mento/board      DOM board, element registry, action queue, renderers, sanitizer, Orb
│  ├─ tutor/       @mento/tutor      turn handler, prompt assembly, tool validation, draw pipelines, judge
│  ├─ db/          @mento/db         Mongoose models, MongoDB repository, in-memory repository, seed
│  ├─ sources/     @mento/sources    PDF ingestion, chunks, FTS, citation validator
│  ├─ analysis/    @mento/analysis   post-session analysis → insights
│  └─ voice/       @mento/voice      /client (STT hook, useAudioLevel, SpeechPlayer impl) and /server (token, TTS proxy)
├─ scripts/                          tsx scripts: seed, ingest, pregenerate-images, turn-cli, fixture-check
├─ fixtures/                         JSON scripts and event logs (validated by contract tests)
├─ prompts/                          base.md, personas.md, subjects/*.md
├─ workstreams/                      division of work among the 3 people
├─ materials/                        sample PDFs (git-ignored)
├─ assets/                           brand source files (founder-owned)
├─ data/                             files/gen, files/tts (git-ignored)
├─ docs/  .github/                   documentation; workflows/ci.yml, CODEOWNERS, PR template
├─ package.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js, .prettierrc
├─ .env.example, .nvmrc, .gitignore
└─ AGENTS.md, CLAUDE.md, README.md
```

## 4. Apps and packages

| Unit | Purpose | Owner | Runs in | Internal deps (allowed) |
|---|---|---|---|---|
| `@mento/contracts` | Schemas and interfaces shared by everyone. **Frozen after kickoff, additive only** | Shared | both | — |
| `@mento/ui` | Design tokens, base components (`18`, `19`) | Person 2 (shared at kickoff) | client | — |
| `@mento/board` | Board DOM, action queue, renderers, sanitizer, Orb | Person 2 | client | contracts, ui |
| `@mento/voice` | `client` (STT hook, SpeechPlayer) and `server` (token, TTS proxy) entries | Person 3 | both (split) | contracts |
| `@mento/tutor` | Turn handler, prompts, tools, drawing, judge | Person 3 | server | contracts, sources |
| `@mento/db` | Schema, repositories, seed | Person 1 | server | contracts |
| `@mento/sources` | Ingestion, chunks, FTS, citation validator | Person 1 | server | contracts |
| `@mento/analysis` | Post-session analysis → insights | Person 1 | server | contracts |
| **`@mento/api`** (app) | **Fastify service; the only place that wires packages together** | routes split by person (§5) | server | all server packages + contracts |
| `@mento/web` (app) | UI pages | split by route group | client | contracts, ui, board, voice/client |

### Rules (enforced by declared dependencies, plus ESLint)

1. **`apps/web` contains no server code and never imports server packages** (`db`, `sources`, `tutor`, `analysis`, `voice/server`) or secrets. It talks to the API over HTTP/SSE.
2. **Packages never import `apps/*`.** A package may import only the internal packages listed above (pnpm resolves nothing undeclared).
3. **`apps/api` is the only composition root:** `container.ts` builds the repository, tutor, sources, analysis, voice, `JobQueue`, `EventBus`, `FileStore`.
4. **`tutor` depends on interfaces, not on `db`:** it receives a `Repository` by injection.
5. **Environment variables are read only in `apps/api/src/config.ts`, in `apps/web` (`NEXT_PUBLIC_*` only) and in `scripts/`**, never inside packages; packages take config as arguments.
6. Route files are **thin**: parse with Zod → call a package function → respond. No business logic in routes.
7. Do not use the `server-only` package in shared packages (it throws from plain Node scripts).
8. No relative imports across packages; use `@mento/*`.
9. **API instances stay stateless:** durable state in the database; in-memory caches must be rebuildable (so more instances can run later).

## 5. API service (`apps/api`)

**Bootstrap (`server.ts`):** create the Fastify app with the Zod type provider; register `cors`, `multipart`, `websocket`, optional `swagger`; request-id and Pino logging; central error handler (Zod errors → `400` with a problem-style JSON); `/health`; **graceful shutdown** (stop accepting, abort open SSE streams, finish jobs); **autoload** every file in `routes/` under the `/api` prefix, so adding a route file never touches a shared file.

**SSE helper (`plugins/sse.ts`):** sets `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, sends a **keep-alive comment every ~15 s**, flushes on every event, and **aborts the work when the client disconnects** (propagates an `AbortSignal` to the LLM, TTS and image calls).

### Routes (prefix `/api`; one file per area, owner = person)

| File | Endpoints | Owner |
|---|---|---|
| `students.ts` | `GET /students`, `POST /students`, `GET /students/:id` | P1 |
| `sessions.ts` | `POST /sessions`, `GET /sessions/:id/events` | P1 |
| `turn.ts` | `POST /sessions/:id/turn` (**SSE**), `POST /sessions/:id/end` | P3 |
| `voice.ts` | `POST /voice/token`, `POST /tts` | P3 |
| `overview.ts` | `GET /overview` | P1 |
| `class-context.ts` | `GET/PUT /class-context` | P1 |
| `insights.ts` | `PATCH /insights/:id` | P1 |
| `materials.ts` | `GET/POST /materials` (multipart), `GET /materials/:id` | P1 |
| `files.ts` | `GET /files/:id` (PDFs, generated images, cached audio) | P1 |
| `teacher-stream.ts` | `GET /stream/teacher` (**SSE** live feed: `insight_created`, `session_started`, `session_ended`, `material_status`) | P1 |
| `dev-fixtures.ts` | `GET /dev/fixture-turn?name=` (replays a fixture in the real SSE format) | P3 |
| `dev-analyze.ts` | `POST /dev/analyze/:sessionId` (re-run the analysis) | P1 |

The public paths are the same ones documented in `16-technical-roadmap.md` §11; they are now served by `apps/api`, not by Next.js. The teacher live feed **replaces polling** (keep a 5-second polling fallback).

### How the web app calls it

`apps/web/src/lib/api.ts` wraps `fetch` and an SSE reader using the Zod schemas from `@mento/contracts`. The browser calls `NEXT_PUBLIC_API_URL` **directly** (CORS allows `WEB_ORIGIN`).

## 6. Scale-ready seams (not extra work now)

Three small interfaces in `@mento/contracts`, each with an **in-memory implementation for the hackathon**:

```ts
interface EventBus  { publish(topic: Topic, payload: unknown): void;
                      subscribe(topic: Topic, handler: (p: unknown) => void): () => void; }
interface JobQueue  { register(name: JobName, handler: (payload: unknown) => Promise<void>): void;
                      enqueue(name: JobName, payload: unknown): Promise<void>; }   // "ingest_material" | "analyze_session"
interface FileStore { put(key: string, data: Uint8Array): Promise<void>;
                      get(key: string): Promise<ReadableStream | Uint8Array>; url(key: string): string; }
```

| Phase | What changes | When |
|---|---|---|
| **Hackathon (now)** | 1 API instance, one MongoDB (local or Atlas), in-process jobs and bus, local disk | Now |
| **Pilot** | **Postgres** (`Repository` implementation), **Redis** for `JobQueue` (e.g., BullMQ) and the cross-instance `EventBus` (pub/sub), S3-compatible `FileStore`, authentication and per-school tenancy, rate limiting, **several stateless API instances behind a load balancer**, tuned SSE idle timeouts, observability (OpenTelemetry/Sentry) | First real school *(verify choices then)* |

Because routes are thin and state lives behind interfaces, the pilot phase swaps implementations in `container.ts` without touching routes, tutor or analysis.

## 7. Root configuration (sketches)

`pnpm-workspace.yaml`
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Root `package.json` (the team's shared vocabulary)
```json
{
  "name": "mento",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@<pin-at-kickoff>",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "pnpm --parallel --filter @mento/api --filter @mento/web dev",
    "dev:api": "pnpm --filter @mento/api dev",
    "dev:web": "pnpm --filter @mento/web dev",
    "build": "pnpm -r build",
    "start:api": "pnpm --filter @mento/api start",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint .",
    "test": "pnpm -r test",
    "seed": "tsx scripts/seed.ts",
    "ingest": "tsx scripts/ingest.ts",
    "pregenerate": "tsx scripts/pregenerate-images.ts",
    "turn": "tsx scripts/turn-cli.ts",
    "fixtures:check": "tsx scripts/fixture-check.ts"
  }
}
```

`apps/api/package.json` (sketch): `"dev": "tsx watch src/server.ts"`, `"start": "tsx src/server.ts"` (or build to JS later), dependencies on `fastify`, the Fastify plugins above, `zod`, and `workspace:*` server packages *(verify exact versions at kickoff)*.

Package template and `tsconfig` as before: `exports: { ".": "./src/index.ts" }`, `tsc --noEmit` for typecheck, internal deps with `workspace:*`; Next (`apps/web`) uses `transpilePackages` for the client packages; the API runs TS source with `tsx`.

**Ports and env:** web `3000`, API `4000`; root `.env` holds `API_PORT`, `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL` and all provider keys (`20-demo-runbook.md` §2). `.gitignore` additions: `data/`, `coverage/`, `*.tsbuildinfo`.

## 8. Scripts

| Script | Purpose | Owner |
|---|---|---|
| `seed` | Students (real + simulated badge), class context ("8º ano"), demo insights | P1 |
| `ingest` | A PDF in `materials/` → material row, chunks, FTS index, outline (same pipeline as the upload job) | P1 |
| `pregenerate` | Generate and cache demo images | P3 |
| `turn` | Print a turn's SSE script for a prompt, no UI | P3 |
| `fixtures:check` | Validate every fixture against the contracts | P2 + P3 |

## 9. Tests, CI and review

- **Vitest per package.** Minimum: `contracts` validates all `fixtures/*.json`; `board` tests the action queue with a fixture; `tutor` tests tool validation; `sources` tests the citation validator; `db` tests the repository against the in-memory twin; **`api` tests routes with Fastify `inject`** (and one SSE test that reads a fixture stream).
- **CI** (`.github/workflows/ci.yml`): checkout → setup pnpm + Node → `pnpm install --frozen-lockfile` → `typecheck` → `lint` → `test`.
- **`CODEOWNERS`** (fill usernames when Q9 is answered): `/packages/board/ /packages/ui/ /apps/web/src/app/(student)/` → Person 2; `/packages/tutor/ /packages/voice/ /prompts/ /apps/api/src/routes/turn.ts /apps/api/src/routes/voice.ts /apps/api/src/routes/dev-fixtures.ts` → Person 3; `/packages/db/ /packages/sources/ /packages/analysis/ /apps/web/src/app/(teacher)/` and the other `/apps/api/src/routes/*` → Person 1.
- Branch protection on a **private** repo may need a paid GitHub plan *(verify)*; otherwise rely on CI and "small PRs, rebase before merging".

## 10. Ownership by path

> Lane A = **Person 2**, Lane B = **Person 3**, Lane C = **Person 1** (`workstreams/README.md`).

| Path | Owner |
|---|---|
| `packages/contracts/**` | Shared, frozen (additive PRs) |
| `packages/ui/**`, `apps/web/public/brand/**` | Person 2 (shared at kickoff) |
| `packages/board/**`, `apps/web/src/app/(student)/**`, `apps/web/src/lib/api.ts` | Person 2 |
| `packages/tutor/**`, `packages/voice/**`, `prompts/**`, `apps/api/src/routes/turn.ts`, `voice.ts`, `dev-fixtures.ts`, `scripts/turn-cli.ts`, `scripts/pregenerate-images.ts` | Person 3 |
| `packages/db/**`, `packages/sources/**`, `packages/analysis/**`, `apps/web/src/app/(teacher)/**`, the other route files in `apps/api/src/routes/`, `scripts/seed.ts`, `scripts/ingest.ts` | Person 1 |
| `apps/api/src/server.ts`, `container.ts`, `plugins/**`, `config.ts`, `next.config.ts`, root layout, Tailwind config | Shared (small additive edits; announce them). *Suggestion: Person 3 creates the API skeleton at K1* |
| `fixtures/**` | Person 2 and Person 3 add new files; never edit the other's |
| `assets/**` | Founder |
| Root configs, `package.json`, lockfile | Shared (small PRs; after a merge run `pnpm install`) |

## 11. Kickoff K1 checklist (one person, ≤ 60 min; others do day-0 checks)

1. Create the layout above; `pnpm init`; add `pnpm-workspace.yaml`, `tsconfig.base.json`, ESLint, Prettier, `.nvmrc`, `.env.example`.
2. `create-next-app` inside `apps/web` (TypeScript, Tailwind, App Router, `src/` dir); rename to `@mento/web`; **delete any example `api` route**.
3. Create `apps/api` (Fastify + TypeScript): `server.ts` with `/health`, CORS, error handler, SSE helper, autoloaded `routes/`; add a `GET /api/ping` route using a Zod schema from `@mento/contracts`.
4. Create the 8 package skeletons from the template; wire `workspace:*` dependencies exactly as in §4.
5. `pnpm install`; `pnpm dev` starts **both**; the web page calls `/api/ping` through `src/lib/api.ts` and renders the result (proves the wiring, CORS and the shared contract).
6. Add the CI workflow and `CODEOWNERS` placeholders; commit to `main`; the others pull.
7. Then K2–K9 from `17-work-split.md` (contracts, repository interface, fixtures, tokens, brand copy), plus the `EventBus`/`JobQueue`/`FileStore` interfaces and in-memory implementations.

## 12. Mapping from earlier layouts

| Earlier | Now |
|---|---|
| `src/contracts/`, `src/ui/`, `src/board/`, `src/tutor/`, `src/db/`, `src/sources/`, `src/analysis/`, `src/voice/` | `packages/<name>/src/` |
| `src/app/(student)`, `(teacher)` | `apps/web/src/app/(student)`, `(teacher)` |
| `apps/web/src/app/api/**` (Next route handlers, previous plan) | `apps/api/src/routes/*.ts` (Fastify, prefix `/api`) |
| `apps/web/src/server/container.ts` | `apps/api/src/container.ts` |
| `public/brand/` | `apps/web/public/brand/` |

## 13. Risks and fallbacks

| Risk | Mitigation |
|---|---|
| Two processes complicate dev and the demo | `pnpm dev` starts both; document ports; the runbook starts them in order; K1 proves it |
| Proxies/CDNs buffer or cut SSE | Call the API directly (CORS), send keep-alive pings, set `X-Accel-Buffering: no`, test through the real hosting path before the demo |
| CORS mistakes | One `WEB_ORIGIN` env var; test from the browser at K1 |
| Fastify plugin/type-provider friction | Fall back to plain Fastify validation with Zod `.parse` inside routes; NestJS only if the team already knows it |
| Workspace friction | Fallback: collapse packages into folders under `apps/api/src` and `apps/web/src` keeping the same names |
| Next.js does not transpile an internal package | Add it to `transpilePackages`; keep packages plain TS/ESM |
| Mongoose / MongoDB driver | Server-only (`apps/api`); the web app never imports it |
| Lockfile conflicts | Small dependency PRs; rebase, `pnpm install`, commit the lockfile |

## 14. Open questions

1. **Fastify (recommended) or NestJS** for `apps/api` (Q20).
2. **What "Yash" is** (the founder mentioned connecting to "Yash"; unclear, possibly an external system or a teammate's service). The OpenAPI description and the stable `/api` contract are meant to make that integration easy (Q21).
3. pnpm or npm workspaces (recommendation: pnpm); exact Node, Next.js, Fastify and pnpm versions *(verify at kickoff)*.
4. Where to host the API for the demo (laptop/VM with Node; long-lived streams need a container-style host, not serverless).
5. Whether to keep Next.js for the frontend or use a plain React SPA (Vite) now that Next has no server role (recommendation: keep Next for now).
