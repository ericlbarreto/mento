# 21 — Repository structure (monorepo)

> Status: **proposed layout, to be created at kickoff (K1)**. Tool versions and exact config values are marked *(verify at kickoff)*. Last updated: 2026-10-30.
> **Decision D28:** the founder asked for a monorepo. This **refines D24** (which said "one Next.js project") and replaces the `src/*` layout in `17-work-split.md`. Lanes, contracts, checkpoints and ownership rules there still apply; only the **paths** change.

## 1. Why a (light) monorepo

- **Each lane owns packages, not folders inside one app.** Package boundaries are enforceable (a package cannot import what it does not declare) and each package can be typechecked and tested on its own, so three people rarely touch the same files.
- **Shared contracts live in one package** (`@mento/contracts`) used by client and server.
- **Room to grow** after the hackathon (new apps, worker, mobile) without restructuring.
- **Cost kept low:** workspaces only. **No Turborepo/Nx** for the hackathon; `pnpm -r` is enough. Add a task runner only if CI becomes slow.

## 2. Tooling

| Area | Choice | Notes |
|---|---|---|
| Workspaces | **pnpm workspaces** | Strict `node_modules`: a package cannot import an undeclared internal package (natural boundary enforcement). `npm` workspaces work too if the team prefers; pick one at kickoff |
| Node | Current LTS, pinned in `.nvmrc` and `engines` *(verify at kickoff)* | |
| Language | TypeScript, `strict: true`, **ESM everywhere** | One `tsconfig.base.json`, per-package `tsconfig.json` extends it |
| App | **Next.js (App Router)** in `apps/web` | UI + thin route handlers |
| Internal packages | **Consumed as TypeScript source (no build step)** | `exports` points to `src/index.ts`; Next uses `transpilePackages`; scripts run with `tsx` |
| Validation | Zod | In `@mento/contracts` |
| Styling | Tailwind (+ shadcn/ui primitives in `@mento/ui`) | |
| DB | SQLite (Drizzle or `better-sqlite3`) | Server-only, in `@mento/db` |
| Tests | Vitest per package | Contract tests validate every fixture |
| Lint/format | ESLint (flat config) + Prettier at the root | One config for the whole repo |
| CI | GitHub Actions: install, typecheck, lint, test | Keeps `main` green |

## 3. Directory tree

```
mento/
├─ apps/
│  └─ web/                         Next.js app (@mento/web) — composition root
│     ├─ public/brand/             logo, mascot, GIFs, icons (copied from assets/)
│     ├─ src/app/
│     │  ├─ (student)/             start screen, tutor session page
│     │  ├─ (teacher)/             Alunos tab (metrics, list, detail, class context) and Materiais tab
│     │  ├─ api/
│     │  │  ├─ sessions/           POST create
│     │  │  ├─ sessions/[id]/turn  POST → SSE script
│     │  │  ├─ sessions/[id]/events GET log
│     │  │  ├─ voice/token         POST ephemeral STT token
│     │  │  ├─ tts                 POST streaming TTS proxy
│     │  │  ├─ files/[id]          GET PDFs and generated images
│     │  │  ├─ overview                  GET teacher metrics
│     │  │  ├─ class-context             GET/PUT global class context
│     │  │  ├─ students, students/[id]   GET list/detail, POST create
│     │  │  ├─ insights/[id]             PATCH accept/dismiss
│     │  │  ├─ materials, materials/[id] GET list/status, POST upload (starts ingestion)
│     │  │  └─ dev/fixture-turn    GET replay a fixture through the real SSE format
│     │  ├─ icon.png, apple-icon.png
│     │  └─ layout.tsx, globals.css
│     ├─ src/server/container.ts   wiring: getRepository(), getTutor(), getSources() ...
│     ├─ next.config.ts            transpilePackages, loads root .env
│     ├─ tailwind config, tsconfig.json, package.json
├─ packages/
│  ├─ contracts/   @mento/contracts  Zod schemas (actions, SSE, events, citations), Repository + SpeechPlayer interfaces
│  ├─ ui/          @mento/ui         tokens (CSS variables), Button, Card, Chip, Avatar, Drawer, Table, InsightCard
│  ├─ board/       @mento/board      DOM board, element registry, action queue, renderers, sanitizer, Orb
│  ├─ tutor/       @mento/tutor      turn handler, prompt assembly, tool validation, draw pipelines, judge
│  ├─ db/          @mento/db         schema, SQLite repository, in-memory repository, seed
│  ├─ sources/     @mento/sources    PDF ingestion, chunks, citation validator
│  ├─ analysis/    @mento/analysis   post-session analysis, simulated students
│  └─ voice/       @mento/voice      /client (STT hook, useAudioLevel, SpeechPlayer impl) and /server (token, TTS proxy)
├─ scripts/                          tsx scripts: seed, ingest, pregenerate-images, turn-cli, fixture-check
├─ fixtures/                         JSON scripts and event logs (data; validated by contract tests)
├─ prompts/                          base.md, personas.md, subjects/*.md (text files)
├─ materials/                        sample PDFs for the ingestion script (git-ignored)
├─ assets/                           brand source files (founder-owned; copied into apps/web/public/brand)
├─ data/                             local SQLite file (git-ignored)
├─ docs/                             documentation
├─ .github/                          workflows/ci.yml, CODEOWNERS, pull_request_template.md
├─ package.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js, .prettierrc
├─ .env.example, .nvmrc, .gitignore
└─ AGENTS.md, CLAUDE.md, README.md
```

## 4. Packages

| Package | Purpose | Lane | Runs in | Internal deps (allowed) |
|---|---|---|---|---|
| `@mento/contracts` | Schemas and interfaces shared by everyone. **Frozen after kickoff, additive only** | Shared | both | — |
| `@mento/ui` | Design tokens and base components (`18`, `19`) | Shared at kickoff, then A | client | — |
| `@mento/board` | Board DOM, action queue, renderers, sanitizer, Orb | A | client | contracts, ui |
| `@mento/tutor` | Turn handler, prompts, tools, drawing, judge | B | server | contracts, sources |
| `@mento/db` | Schema, repositories, seed | C | server | contracts |
| `@mento/sources` | Ingestion, chunks, citation validator | C | server | contracts |
| `@mento/analysis` | Post-session analysis | C | server | contracts |
| `@mento/voice` | STT/TTS (`client` and `server` entry points) | C | both (split) | contracts |
| `@mento/web` (app) | Pages and route handlers; **only place that wires packages together** | split by route (see §9) | both | all |

### Rules (enforced by dependencies, plus ESLint)

1. **Packages never import `apps/web`.**
2. **A package may import only the internal packages listed above.** With pnpm, anything not declared in its `package.json` cannot be resolved; keep those lists exactly as the table says.
3. **Client packages (`ui`, `board`, `voice/client`) never import server packages** (`db`, `sources`, `tutor`, `analysis`, `voice/server`). Importing `better-sqlite3` or provider keys into the browser must fail loudly at build time.
4. **`tutor` depends on interfaces, not on `db`:** it receives a `Repository` (from `contracts`) by injection; `apps/web/src/server/container.ts` passes the SQLite implementation (or the in-memory one in dev/tests).
5. **Environment variables are read only in `apps/web` and `scripts/`**, never inside packages; packages receive config as arguments.
6. Do not use the `server-only` package in shared packages: it throws when imported from plain Node scripts (`tsx`).
7. No relative imports across packages (`../../packages/...`); use `@mento/*` names.

## 5. Root configuration (sketches)

`pnpm-workspace.yaml`
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Root `package.json` (scripts are the shared vocabulary of the team)
```json
{
  "name": "mento",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@<pin-at-kickoff>",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "pnpm --filter @mento/web dev",
    "build": "pnpm --filter @mento/web build",
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

Package template (`packages/<name>/package.json`)
```json
{
  "name": "@mento/<name>",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "@mento/contracts": "workspace:*" }
}
```
`tsconfig.json` per package: `{ "extends": "../../tsconfig.base.json", "include": ["src"] }`.

`apps/web/next.config.ts` (pattern)
```ts
const nextConfig = {
  transpilePackages: ["@mento/contracts", "@mento/ui", "@mento/board", "@mento/tutor",
                      "@mento/db", "@mento/sources", "@mento/analysis", "@mento/voice"],
};
export default nextConfig;
```
Load the root `.env` for Next (for example with `@next/env`'s `loadEnvConfig` pointing at the repo root) and for scripts (`dotenv`), *(verify the exact pattern at kickoff)*.

`.gitignore` additions: `data/`, `coverage/`, `*.tsbuildinfo`.

## 6. Scripts (who owns what)

| Script | Purpose | Owner |
|---|---|---|
| `seed` | Create students (real + simulated badge), the class context ("8º ano") and demo insights | C |
| `ingest` | A PDF in `materials/` → material row, chunks, FTS index, outline (same pipeline as the upload) | C |
| `pregenerate` | Generate and cache demo images | B |
| `turn` | Print a turn's SSE script for a prompt, no UI | B |
| `fixtures:check` | Validate every fixture against the contracts | A + B (needs contracts only) |

## 7. Environment and data

- One **`.env` at the repo root** (git-ignored), with names in `.env.example` (see `20-demo-runbook.md` §2).
- **SQLite file** at `data/mento.sqlite` (path via `DATABASE_FILE`).
- **Generated images and uploaded files** under `data/files/` (served by `/api/files/[id]`).
- Brand: keep sources in `assets/`; copy to `apps/web/public/brand/` at kickoff (K9).

## 8. Tests, CI and review

- **Vitest per package.** Minimum: `contracts` validates all `fixtures/*.json`; `board` tests the action queue with a fixture; `tutor` tests tool validation; `sources` tests the citation validator; `db` tests the repository against the in-memory twin.
- **CI** (`.github/workflows/ci.yml`): checkout → setup pnpm and Node → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test`.
- **`CODEOWNERS`** maps paths to the lane owner once names are assigned (Q9):
  `/packages/board/ /packages/ui/ /apps/web/src/app/(student)/` → Lane A;
  `/packages/tutor/ /prompts/` → Lane B;
  `/packages/db/ /packages/sources/ /packages/analysis/ /packages/voice/ /apps/web/src/app/(teacher)/` → Lane C.
- Branch protection (PR required, CI green) is useful, but **protected branches on private repositories may require a paid GitHub plan** *(verify)*; if unavailable, rely on the CI and the team rule "small PRs, rebase before merging".

## 9. Ownership by path (replaces the table in `17` §7)

| Path | Owner |
|---|---|
| `packages/contracts/**` | Shared, frozen (additive PRs) |
| `packages/ui/**`, `apps/web/public/brand/**` | Shared at kickoff, then A |
| `packages/board/**`, `apps/web/src/app/(student)/**` | A |
| `packages/tutor/**`, `prompts/**`, `apps/web/src/app/api/sessions/[id]/turn/**`, `scripts/turn-cli.ts`, `scripts/pregenerate-images.ts` | B |
| `packages/db/**`, `packages/sources/**`, `packages/analysis/**`, `packages/voice/**`, `apps/web/src/app/(teacher)/**`, other `apps/web/src/app/api/**` routes, `scripts/seed.ts`, `scripts/ingest.ts` | C |
| `apps/web/src/server/container.ts`, `next.config.ts`, root layout, Tailwind config | Shared (small additive edits; announce them) |
| `fixtures/**` | A and B add new files; never edit the other's |
| `assets/**` | Founder |
| Root configs, `package.json`, lockfile | Shared (small PRs; after a merge run `pnpm install`) |

## 10. Kickoff K1 checklist (one person, ≤ 45 min; others do day-0 checks)

1. Create the repo layout above; `pnpm init` at root; add `pnpm-workspace.yaml`, `tsconfig.base.json`, ESLint, Prettier, `.nvmrc`, `.env.example`.
2. `create-next-app` inside `apps/web` (TypeScript, Tailwind, App Router, `src/` dir); rename the package to `@mento/web`.
3. Create the 8 package skeletons from the template (empty `src/index.ts`), wire `workspace:*` dependencies exactly as in §4.
4. `pnpm install`; `pnpm dev` shows a hello page that imports one symbol from `@mento/contracts` (proves the wiring).
5. Add the CI workflow and `CODEOWNERS` placeholders; commit to `main`; the other two pull.
6. Then the shared kickoff items K2–K9 from `17-work-split.md` (contracts, repository interface, fixtures, tokens, brand copy).

## 11. Mapping from the earlier `src/*` plan

| Old path (in `17`, `18`, `19`) | New path |
|---|---|
| `src/contracts/` | `packages/contracts/src/` |
| `src/ui/` | `packages/ui/src/` |
| `src/board/` | `packages/board/src/` |
| `src/tutor/` | `packages/tutor/src/` |
| `src/db/` | `packages/db/src/` |
| `src/sources/` | `packages/sources/src/` |
| `src/analysis/` | `packages/analysis/src/` |
| `src/voice/` | `packages/voice/src/` |
| `src/app/(student)`, `(teacher)`, `api` | `apps/web/src/app/...` |
| `public/brand/` | `apps/web/public/brand/` |

## 12. Risks and fallbacks

| Risk | Mitigation |
|---|---|
| Workspace friction eats the first hours | K1 is one person's job with a checklist; fallback: collapse packages into folders under `apps/web/src/` keeping the same names (the boundaries still exist as folders) |
| Next.js does not transpile an internal package | Add it to `transpilePackages`; keep packages as plain TS/ESM |
| Native module (SQLite) breaks bundling | Keep `db` server-only and mark it in `serverExternalPackages` if needed *(verify)* |
| Too many packages for 24 h | Merge `analysis` into `sources`/`db` or `voice` into `web` if the overhead shows; ownership does not change |
| Lockfile conflicts | Small dependency PRs; rebase, `pnpm install`, commit the lockfile |

## 13. Open questions

1. **pnpm or npm workspaces** (recommendation: pnpm).
2. Exact Node, Next.js, Tailwind and pnpm versions to pin *(verify at kickoff)*.
3. Whether protected branches are available on this private repo.
4. Drizzle vs plain `better-sqlite3`.
5. Who does K1 (suggestion: the Lane C owner, since the schema and scripts hang off it).
