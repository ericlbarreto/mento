# 2026-10-30 (time not recorded) — API and web scaffold (K1) and MongoDB decision

- **Person / agent:** Person 3 (founder as proxy) / Claude Code
- **Task id** (from your workstreams file): K1 (API skeleton) · docs/21 §10
- **Docs read first:** AGENTS.md, docs/21-repo-structure.md, docs/17-work-split.md, workstreams/README.md

## Prompt 1 of 3 (verbatim)

```text
Eu quero que você crie toda a estrutura do repositório e instale tudo, porque isso vai ser o ponto de partida inicial. Crie todo o back e o front, no caso, só a estrutura, porque cada pessoa de cada teste vai implementar as coisas. Só crie realmente a estrutura do back e do front, inclua os logos nas pastas corretas, e é isso, tá bom?
```

## Prompt 2 of 3 (verbatim)

```text
Uma coisa: a gente vai usar MongoDB para documentar, para banco de dados. Então, inclua isso aí na documentação técnica e também, se você já instalou alguma coisa relacionada a banco de dados, ORM, enfim, faça isso. 

mongooose
```

## Prompt 3 of 3 (verbatim)

```text
Commit e push
```

## Outcome (English)

Created the pnpm monorepo skeleton: `apps/api` (Fastify 5 with Zod type provider, autoloaded routes under `/api`, SSE helper, working `/api/ping` and `/api/ping/stream`, stub route files per owner), `apps/web` (Next.js 16 + Tailwind 4, placeholder pages, brand assets in `public/brand`), eight `packages/*`, `scripts/` stubs, `fixtures/`, CI and CODEOWNERS. Installed dependencies (pnpm 12.16.1, TypeScript pinned to ~6.0.3 because of the typescript-eslint peer range). Switched the database from SQLite to MongoDB with Mongoose (decision D46) and updated the docs accordingly. Typecheck, tests and lint passed; both dev servers answered.

## Files changed

`apps/api/**`, `apps/web/**`, `packages/*/**`, `scripts/**`, `fixtures/**`, `.github/**`, root configs, `docs/10`, `docs/13`, `docs/16`, `docs/17`, `docs/20`, `docs/21`, `workstreams/*`

## Decisions and contracts touched

D46 (MongoDB + Mongoose; ids are strings in contracts: `workstreams/contracts-spec.md` §1).

## Follow-ups / questions for other people

Person 1 creates the Mongoose models; teams must use MongoDB Atlas if they need vector search later.

## Commit / PR

bb6248e on `main` ("Scaffold monorepo (K1)..."), pushed.
