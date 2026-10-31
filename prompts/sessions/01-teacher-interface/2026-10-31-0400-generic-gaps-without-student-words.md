# 2026-10-31 04:00 — Generic gaps without the student's words; more on overcome concepts

- **Person / agent:** Person 1 / Claude Code
- **Task id** (from your workstreams file): teacher UI
- **Docs read first:** docs/06-teacher-interface.md, docs/08-privacy-zdr-security.md

## Prompt (verbatim)

```text
Quero que a gente mude a questão das lacunas serem algo mais genérico, sem expor de fato o que o aluno falou

[Image #6]

Falar mais sobre o conceito superado eu acho legal, pois ele pode aprender com a aula e o intuito é esse ne

a gente pode apenas marcar como lacuna e depois ir percebendo conforme ir tendo mais conversas

O que vc acha?
```

Answer to the follow-up question: "Front e API" (the API stops sending the student's words too).

## Outcome (English, 3–5 lines)

The teacher API strips `evidence` from every insight/analysis it sends (and the session `topic`, often the student's first message); the database keeps them for the analysis. The student page shows each gap as concept + automatic stage (Em observação, Lacuna, Persistente) + paraphrased diagnosis + likely origin + counts, with only "Dispensar". Resolved gaps and strengths became one block (Superado, Ponto forte, Em sondagem). The student page also stopped refetching on every poll (it took ~7 s for a student with many conversations).

## Files changed

- apps/api/src/controllers/teacher.controller.ts, apps/api/src/routes/teacher-stream.ts, apps/api/test/teacher.test.ts, scripts/e2e-teacher.ts
- apps/web/src/app/(teacher)/professor/{alunos/[id]/page.tsx, _lib/{map,status,status.test,store,types}.ts(x), _components/ClassAnalysis.tsx}
- docs/{06,10}

## Decisions and contracts touched

- D70. Contract shapes unchanged (`evidence` is an empty array, `topic` null in teacher responses).

## Follow-ups / questions for other people

- The analysis' own texts are paraphrases (template writer); if the LLM writer is turned on, its guardrail must keep forbidding quotes.

## Commit / PR

- not committed yet (branch `feat/teacher-frontend`)
