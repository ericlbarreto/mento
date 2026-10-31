# 2026-10-31 01:47 — Export the prompts to the log, then implement the upload linked to a subject

- **Person / agent:** Person 1 / Claude Code
- **Task id** (from your workstreams file): process, upload
- **Docs read first:** prompts/sessions/README.md, prompts/founder-conversation/tools/build_prompt_log.py, the plan of the previous entry

## Prompt 1 of 3 (verbatim)

```text
Ante de tudo, faça uma exportação de todos os meus prompts para a pasta de prompts

analise a pasta e salve certinho
```

## Prompt 2 of 3 (verbatim)

```text
voce adicionou todos la na pasta de prompts? Todos os prompts que eu utilizei até agr?
```

## Prompt 3 of 3 (verbatim)

```text
implemente o plano
```

## Outcome (English)

Exported the Person 1 prompts of this session into this folder (verbatim, read from the transcript with the team's `build_prompt_log.py`) and answered that, at that moment, the export had only been planned. Then implemented the plan. The upload now requires `subject_id` and returns 202; a background job extracts the text, builds the chapters, runs the whiteboard's `ingestPdf` (Voyage embeddings of 1024 numbers into `chunks`), saves the lesson sequence and only then marks the material `ready` (invisible to the tutor before; a failure removes the passages and keeps the reason). One `materials` and one `chunks` collection remain. Tests: 26 of 26 business rules (364 tests), end-to-end with the real Voyage, lint and typecheck clean. Verified on Atlas: the vector and text indexes found the uploaded PDF and the real tutor answered a student's question citing it. Findings along the way: the cluster is on the free tier with its search-index limit already used, and the existing indexes and Eric's book live in database `test`, so the API now connects to the database named in the URI (like `pnpm ingest`) instead of forcing `mento`; the temporary `mento` database was dropped.

## Files changed

- packages/{contracts,db,sources,analysis}/**, apps/api/src/{container,config,server,controllers/materials.controller,routes/materials}.ts
- apps/api/test/*, packages/*/test/*, scripts/{db-stats,e2e-teacher,test-rules,fixture-check}.ts, docs/{04,06,07,10}, workstreams/contracts-spec.md
- prompts/sessions/01-teacher-interface/*

## Decisions and contracts touched

- D64; `contracts-spec.md` §15 (materials are one collection, upload contract); the API connects to the database named in `MONGODB_URI`.

## Follow-ups / questions for other people

- Eric: review the additive fields on the material model and the new options of `ingestPdf`.
- Whiteboard sessions have no `material_id` and are now stored in MongoDB (`sessions`, `events`); the analysis still reads the JSON lab file: connect it to the stored sessions next.
- The Atlas free tier allows few search indexes: a new database cannot get its own vector index.

## Commit / PR

- 5174be8, PR #7
