# 2026-10-30 22:46 — Conversation mocks and the analysis lab (root cause from the lesson sequence)

- **Person / agent:** Person 1 / Claude Code
- **Task id** (from your workstreams file): analysis lab
- **Docs read first:** workstreams/contracts-spec.md §2–§9, packages/contracts/src, docs/05-learner-model-and-analysis.md

## Prompt 1 of 2 (verbatim)

```text
E para o mock da conversa tambem? Ja temos o contrato de como vai ser o schema do banco? Pois a analyses vai ser feita com base na conversa do aluno
```

## Prompt 2 of 2 (verbatim)

```text
Para validar a conversa do aluno com a AI tutor, crie um json em um canto com mocks de conversas (com base em como ta o schema) e coloque na IA para ela analisar e gerar os insights e analises

Queria que a analise fosse mais do tipo

"ele está estudando roma antiga, mas está com muitas dúvidas no assunto inicial, provavelmente é uma lacuna no assunto anterior x saca"

ele vai ter esse contexto por conta do PDF, no qual descreve o que o aluno aprendeu na aula e na sequencia de cada atividade e assunto
```

## Outcome (English)

Answered that the event, evidence and session shapes existed only on paper (stubs in `packages/contracts`) and proposed the missing pieces (`seq`, the session shape, `lesson_id`). Built `fixtures/analysis-lab/`: an 8-lesson material with prerequisites, 8 mock conversations of 5 students in a compact script format, a builder that expands them into contract-shaped events and evidence, an analysis prompt and a checker. Ran the analysis by hand to show the target output: a gap in an earlier lesson explaining the errors in the current one.

## Files changed

- fixtures/analysis-lab/{material.json, scripts.json, build.ts}
- prompts/analysis.md (first draft, later rewritten)

## Decisions and contracts touched

- The material carries a lesson sequence with prerequisites (became D60); the diagnosis follows the prerequisite graph (became D59).

## Follow-ups / questions for other people

- Person 3 must fill `lesson_id` on sessions and on verification questions (contracts-spec §15).

## Commit / PR

- none (committed in 5a8ed31)
