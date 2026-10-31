# 22: Idempotent session finish and resume

- **Person / agent:** Person 3 / Codex
- **Task id:** Whiteboard session lifecycle handoff
- **Docs read first:** `AGENTS.md`, `docs/01-hackathon-scope.md`, `docs/10-decisions.md`, `docs/14-working-rules.md`, `workstreams/README.md`, `workstreams/03-whiteboard-backend.md`, `workstreams/contracts-spec.md`

## Prompt (verbatim)

```text
Eu quero que você crie uma branch a partir da minha. O Mateus fez alguns PRs lá na questão de insight.  É o seguinte: toda vez eu quero que você desenvolva dois endpoints:  

- O endpoint de encerrar sessão (`/finish` ou alguma coisa do tipo). O `finish` vai chamar o endpoint que o Matheus fez, que é o endpoint para gerar os insights. Toda vez que eu for fazer um `finish` eu vou chamar esse endpoint e gerar os insights.

 Eu queria que você também verificasse se, por exemplo, eu finalizo uma sessão, mas entro nela de novo através do histórico de sessões e retomo ela. Esse é o segundo endpoint que você tem que fazer, que é o de retomar. Se eu retomar e depois finalizar de novo, o site vai ficar duplicado ou ele vai ser idempotente ou alguma coisa do tipo. Enfim detona essa analisada e verifica aí

faz sentido sim, analisei aqui, pode executar esse plano

Eu quero que você desenvolva e me dê o PR
```

## Outcome (English, 3–5 lines)

- Added explicit, retry-safe `/finish` and `/resume` endpoints while keeping `/end` compatible.
- Made in-memory and MongoDB lifecycle transitions conditional so concurrent calls append one audit event and trigger analysis once.
- Blocked turns on ended sessions and verified that resumed sessions reuse one analysis/insight identity, recomputing only for new learning input.
- Updated the front-end handoff and canonical contracts.

## Files changed

- `apps/api/src/routes/{sessions,turn}.ts`
- `packages/{contracts,tutor,db,analysis}` lifecycle contracts, repositories and tests
- `docs/frontend-integration.md`, `docs/frontend-rendering-guide.md`, `docs/10-decisions.md`
- `workstreams/contracts-spec.md`

## Decisions and contracts touched

- D66; `session_resumed`; finish/resume response contracts; conditional repository transitions.

## Follow-ups / questions for other people

- Person 2 should call `/resume` before sending a turn from history and `/finish` when leaving again.

## Commit / PR

- This pull request.
