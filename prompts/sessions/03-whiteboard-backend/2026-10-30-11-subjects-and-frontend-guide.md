# 2026-10-30 (time not recorded) — Subjects (matérias), optional subject on sessions, front-end integration guide

- **Person / agent:** Person 3 (founder as proxy) / Claude Code (Opus 5.5)
- **Task id** (from your workstreams file): start-screen change (D54)
- **Docs read first:** workstreams/contracts-spec.md, docs/frontend-contract.md

## Prompt 1 of 1 (verbatim)

```text
Então, a gente vai mudar um pouquinho a UI e, para isso, a gente vai precisar adaptar os endpoints. Basicamente, a gente vai ter um fluxo de matéria. Para cada matéria, eu posso ter um ou mais materiais, certo?

Por exemplo, quando o usuário entrar lá na interface, eu vou ter uma lista de matérias, tipo história, matemática e tal. Para cada matéria, eu posso ver a contagem: se eu tenho dois livros de história, enfim. Aí o usuário vai startar o chat através do clique num botão dessa matéria.

Quando você receber o matéria ID, no caso, você vai fazer inglês, né? Você já vai usar isso para anexar ali os livros para você usar como fonte de conhecimento. A gente vai ter também a opção, no canto da tela, de criar um whiteboard sem nenhum contexto, sem ser um contexto de nenhuma matéria. Para isso, o matéria ID pode ser nulo, opcional. Quando tiver, você coloca os livros como fonte de conhecimento. Quando não tiver, deixa o Hug se virar no sentido de procurar nos embeddings.

Essa é a principal mudança, tá? Você precisa fazer essa modelagem das matérias e também essa questão de tornar o esquema opcional. Quando você terminar de fazer tudo, eu queria que você me fornecesse todos os contratos, endpoints e um .md de como integrar, que eu vou mandar aqui para o front-end para a gente poder integrar.
```

## Outcome (English)

Added subjects: contracts (`Subject`, `SubjectSummary`, `ListSubjectsResponse`, `CreateSubjectRequest`, `SubjectStore`, `ErrorResponse`), a `subjects` collection with `MongoSubjectStore`, `materials.subject_id`, and searches filtered by a subject's materials (`material_id $in`, no index change). `POST /api/sessions` takes an optional/nullable `subject_id` (validated: 404 unknown, 503 when the database is down); the tutor names the subject in its prompt and limits its catalog and both searches to that subject's books; a free whiteboard searches everything. New routes `GET /api/subjects`, `GET /api/subjects/:id`, `POST /api/subjects`. The ingestion script creates the subject from `--subject=<key>`; the test book was re-ingested under História. End to end with the real API: subjects listed, sessions created, and a turn about the Gracchi cited the book (p.257, p.322). Wrote `docs/frontend-integration.md` with every contract and endpoint. `student_id` stays required (the front sends a demo id until there is a student picker).

## Files changed

`packages/contracts/src/{subjects,sessions,retrieval,chunk-store,errors}.ts`, `packages/db/src/{models/subject.model,mongo-subject-store,mongo-chunk-store}.ts`, `packages/sources/src/{retriever,ingest}.ts`, `packages/tutor/src/{prompt-builder,repository,turn-engine,turn-runtime,testing/memory-repository}.ts`, `apps/api/src/{routes/subjects,routes/sessions,container,with-catalog}.ts`, `scripts/ingest.ts`, `docs/frontend-integration.md`, `docs/frontend-contract.md`, `docs/10-decisions.md`, `workstreams/contracts-spec.md` §14

## Decisions and contracts touched

D54 (subjects drive the whiteboard; supersedes the "search everything" part of D51); contracts-spec §14.

## Follow-ups / questions for other people

Person 2: integrate from `docs/frontend-integration.md`. Person 1: the teacher UI can create subjects with `POST /api/subjects`; materials must carry `subject_id`.

## Commit / PR

c916bc2 … (subjects commits) on `feat/whiteboard-api`
