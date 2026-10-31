# 2026-10-31 01:34 — Plan: upload linked to a subject, with embeddings in the vector store

- **Person / agent:** Person 1 / Claude Code
- **Task id** (from your workstreams file): upload, integration
- **Docs read first:** packages/sources/src/{ingest,pdf,retriever,voyage}.ts, packages/db/src/{mongo-chunk-store,mongo-subject-store,search-indexes}.ts, apps/api/src/routes/subjects.ts, docs/10-decisions.md (D53, D54)

## Prompt 1 of 3 (verbatim)

```text
Agora faça uma mudança

Na hora de upload do PDF, nós iremos linkar ele a uma matéria (que ja está no schema) e logo após fazer o upload, iremos fazer o embeedings para colocar no banco vetorial do mongodb

planeje isso para alterar, mas antes suba esse rebase concluido
```

## Prompt 2 of 3 (verbatim)

```text
continue o planejamento
```

## Prompt 3 of 3 (verbatim)

```text
O upload que eu implementei vai salvar esse documento que vai ser usado por eric, ou seja, tudo que eric precisa para fazer o fluxo dele funcionar, eu tenho que implementar no meu upload

resolveu?
```

## Answers given to the assistant's questions (verbatim)

- **Two material collections (Eric's `materials`/`chunks` and my `teachermaterials`/`teacherchunks`): who created mine, and how do we unify?** → Mas o teachermaterials o teacherchunks foi eu ou eric que criou?
- **The `.env` has no VOYAGE_API_KEY: what should the upload do without it?** → adicionei essa key
- **Can I unify into one collection?** → Sim, uma só (Recomendado)

## Outcome (English)

Read Eric's ingestion pipeline (`ingestPdf`, the Voyage client, `MongoChunkStore`, the subject store and the Atlas search indexes) and planned the change: the upload requires a subject, and a background job reuses the whiteboard's own ingestion so the embedded passages land in `chunks`, with everything the tutor's flow reads (status `ready`, `subject_id`, the subject key, title, pages, chapters, passages, search indexes). Explained that `teachermaterials` / `teacherchunks` were created by me during the rebase, and the founder chose one collection. The plan was shown for review three times while the founder refined the requirement that the upload must deliver everything Eric's flow needs.

## Files changed

- none (plan only; the code is in the next entry)

## Decisions and contracts touched

- Proposed D62 (one `materials` and one `chunks` collection; the upload is the entry point of the material flow).

## Follow-ups / questions for other people

- Tell Eric that the material model gained optional fields and that `ingestPdf` gained `material_id`, `pages` and `markReady`.

## Commit / PR

- none
