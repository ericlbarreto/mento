# 2026-10-30 (time not recorded) — Controllers, services and MongoDB structure for the API

- **Person / agent:** Person 3 (founder as proxy) / Claude Code
- **Task id** (from your workstreams file): K1 follow-up · API layers
- **Docs read first:** docs/21-repo-structure.md §5, apps/api/README.md, packages/db/README.md

## Prompt 1 of 2 (verbatim)

```text
Beijo. Eu queria que você criasse a estrutura de pastas e talvez controllers e services para a API: um controller base, talvez de health, e um service só para ter a estrutura também do Mongo. As pastas do Mongo, tipo models, esse tipo de coisa, porque daí já facilita para o pessoal fazer as outras atividades, ok

Deixa tudo pronto, porque daí as outras pessoas só precisam criar os modelos. Cada pessoa vai ser responsável por criar a modelagem, então você só precisa realmente deixar os modelos certinhos ali com a configuração do MongoDB.
```

## Prompt 2 of 2 (verbatim)

```text
pode subir na main pfvr
```

## Outcome (English)

Added the layered structure `routes/` → `controllers/` → `services/` → models in `@mento/db`: `GET /api/health` with `health.controller.ts`, `MongoService` (connect, disconnect, state, ping) registered in the container, `connectMongo`/`pingMongo` and `baseSchemaOptions` (timestamps, string `id`, no `__v`) in `packages/db`, and an empty `models/` folder with a README and template. The server warns instead of crashing when MongoDB is unreachable. Tests, typecheck and lint passed; pushed to `main`.

## Files changed

`apps/api/src/{controllers,services,routes/health.ts,container.ts,config.ts,server.ts,app.ts}`, `packages/db/src/*`, `packages/contracts/src/health.ts`

## Decisions and contracts touched

`HealthResponse` added to `@mento/contracts` (additive).

## Follow-ups / questions for other people

Each person adds their own models under `packages/db/src/models/`.

## Commit / PR

6747e7c on `main`, pushed.
