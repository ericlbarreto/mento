# 2026-10-31 04:30 — Class block from the real gaps: topics and interventions

- **Person / agent:** Person 1 / Claude Code
- **Task id** (from your workstreams file): teacher UI
- **Docs read first:** docs/06-teacher-interface.md, docs/10-decisions.md (D67, D68, D70)

## Prompt (verbatim)

```text
Essa questão da lacuna acho que faz mais sentido se a gente masterizar o conteúdo que tem lacuna do qu deixar específico do que o aluno falou de errado e tudo mais

[Image #8]

exemplo:

"Maya Pereira:

Dificuldade no contexto de governança imperial"

E com base nisso a parte de intervenção na aula ser baseado nos tópicos que os alunos mais sentem dificuldades

[Image #9]

Isso aqui está em que parte do banco? Como foi executado isso?
```

Answer to the follow-up question: "Sim, como proposto" (real topics and interventions, exercise list disabled "em breve").

## Outcome (English, 3–5 lines)

Explained that the old class block was 100% mock in the browser (mock.ts, a fixed exercise list behind a 1.5 s timeout, PDFs built client-side). Replaced it with "Tópicos com mais dificuldade" (real open gaps grouped by topic, students and their stage, lesson of origin) and "Intervenção para a próxima aula" (top 3 topics; adopting or dismissing applies to every student's suggestion). Gaps read "Dificuldade em *tópico*" on both pages. Removed the exercise/PDF mock and the simulated class insights.

## Files changed

- apps/web/src/app/(teacher)/professor/_components/ClassAnalysis.tsx (rewritten); _lib/{map,map.test,store,status,types,mock}.ts(x); page.tsx; alunos/[id]/page.tsx
- removed: _components/ExerciseList.tsx, _lib/exercises.ts, _lib/pdf.ts
- docs/{06,10}

## Decisions and contracts touched

- D71 (supersedes D68). No contract or API change.

## Follow-ups / questions for other people

- Real exercise lists need an LLM (Nice #18).

## Commit / PR

- not committed yet (branch `feat/teacher-frontend`)
