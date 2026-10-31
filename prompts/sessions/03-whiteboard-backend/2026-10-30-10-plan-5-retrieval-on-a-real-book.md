# 2026-10-30 (time not recorded) — Plan 5 executed: ingestion and hybrid retrieval tested on a real book

- **Person / agent:** Person 3 (founder as proxy) / Claude Code (Opus 5.5)
- **Task id** (from your workstreams file): plan 5 (T5 of workstreams/03)
- **Docs read first:** docs/superpowers/plans/2026-10-30-wb-5-retrieval.md

## Prompt 1 of 7 (verbatim)

```text
Eu acho que o plano 5 é meu, hein? O que é o plano 5? Fala mais sobre isso, por favor. 

Eu já coloquei também o Voyage API key e, além disso, já deu certo a geração de imagem. Me explica aí, por favor.
```

## Prompt 2 of 7 (verbatim)

```text
Isso aí é minha parte, irmão. Eu posso pegar algum livro, então você pode pesquisar no Google algum PDF e fazer o parse dele só para testar isso, mas isso é da nossa parte, sim. Além disso, eu testei o Flash. Esse 3.u gerou uma imagem meio legal, então você pode usar ele, tá?
```

## Prompt 3 of 7 (verbatim)

```text
Pode baixar
```

## Prompt 4 of 7 (verbatim)

```text
o voyage nao era de graça?
```

## Prompt 5 of 7 (verbatim)

```text
me de o link
```

## Prompt 6 of 7 (verbatim)

```text
adicionei, tente dnv
```

## Prompt 7 of 7 (verbatim)

```text
Sim, corrija
```

## Outcome (English)

Moved ingestion and retrieval into this workstream (D53) and executed plan 5: chunking, Voyage embeddings, PDF text, hybrid retriever, MongoDB models and Atlas indexes, wiring, scripts. The Atlas integration test passed on the team cluster (vector index and Portuguese text index). Downloaded an open-access test book (História de Roma Antiga I, Universidade de Coimbra, 2015) with the founder's approval; the first ingestion hit Voyage HTTP 429 (no payment method), so retries with backoff were added and the founder added a payment method (free tokens still apply). Ingestion: 489 pages → 896 passages in ~26 s. Added text cleaning (line-break hyphens, page numbers, letter-spaced headings, tables of contents skipped) and `--replace`. Retrieval check: all 6 Portuguese questions hit relevant pages; search p50 0.84 s, of which the query embedding is 0.78 s. `gemini-3.1-flash-lite-image` confirmed as the image model.

## Files changed

`packages/sources/**`, `packages/db/**`, `packages/contracts/src/{chunk-store,retrieval}.ts`, `apps/api/src/{container,with-catalog,config}.ts`, `scripts/{ingest,retrieval-check}.ts`, `fixtures/retrieval/questions.json`, spec §11 results

## Decisions and contracts touched

D53 (ingestion and retrieval belong to Person 3); `ChunkStore` contract; `IngestReport.toc_pages`.

## Follow-ups / questions for other people

Take the query embedding off the critical path (latency).

## Commit / PR

af1a392 … 4b1dbd1 on `feat/whiteboard-api`
