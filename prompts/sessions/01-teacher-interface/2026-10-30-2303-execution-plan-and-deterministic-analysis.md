# 2026-10-30 23:03 — Execution plan, deterministic analysis explained, test battery

- **Person / agent:** Person 1 / Claude Code
- **Task id** (from your workstreams file): plan, T-all
- **Docs read first:** docs/21-repo-structure.md, apps/api (K1), packages/db, packages/contracts

## Prompt 1 of 4 (verbatim)

```text
Agora planeje a execução de tudo

O que vai estar mockado é somente os alunos, Pode executar algum script para executar no banco essas informações para esse caso

- materiais (posteriormente iremos salvar no banco via rota)
- conversas

Pode usar o superpowers para isso
```

## Prompt 2 of 4 (verbatim)

```text
Me explique mais, de forma técnica e detalhada de como vai fazer a análise da conversa com aluno, e como vai deixar concreta e de forma determinística

Seja conciso e direto
```

## Prompt 3 of 4 (verbatim)

```text
Envie o planejamento inteiro dessa implementação
```

## Prompt 4 of 4 (verbatim)

```text
alguns pontos:

- Não precisa por agora salvar no banco nada relacionado as conversas dos alunos
- esse chunks é o que exatamente
- Depois de tudo faça um teste com base na regra de negócio para ver se tudo está funcionando corretamente (faça uma bateria de testes e uma agenda de testes com base nessa regra)
```

## Outcome (English)

Wrote the phased execution plan (contracts, models, seeds, analysis engine, API, material upload, tests) and explained the analysis step by step: load, input hash, counters, ordered rules, prerequisite-graph diagnosis, confidence formula, template or LLM text, guardrails, idempotent writes. Published the plan as a page. Applied the founder's corrections: conversations are not stored in MongoDB for now (read through a `ConversationSource`), what chunks are, and a business-rule test battery (BR-01 to BR-24) with a test agenda.

## Files changed

- docs/plans/2026-10-30-teacher-backend.md

## Decisions and contracts touched

- Conversations stay in a JSON file behind `ConversationSource` (became D59).
- The LLM only writes text; rules decide (became D60).

## Follow-ups / questions for other people

- LLM provider still open (Q4).

## Commit / PR

- none (committed in 5a8ed31)
